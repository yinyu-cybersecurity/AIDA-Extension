import json
import asyncio
from pathlib import Path
from typing import AsyncGenerator, Dict, Any, List
from sqlalchemy import func
from openai import AsyncOpenAI
from config import settings
from database import SessionLocal
from models import AssessmentAIMessage
from utils.logger import get_logger
from mcp_custom.modules.mcp_classes import AidaMCPService
from mcp_custom.modules.mcp_tools import get_tool_definitions
from mcp_custom.modules.mcp_handlers import handle_tool_call
from websocket.events import EventType, create_event

logger = get_logger(__name__)
PREPROMPT_FILE = Path(__file__).resolve().parents[2] / 'Docs' / 'PrePrompt.txt'


class AIAgentService:
    # 扩大对话上下文窗口，允许 AI 能够记住更多交互历史
    MAX_CONTEXT_MESSAGES = 150

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY or 'dummy',
            base_url=settings.OPENAI_BASE_URL
        )
        self.model = settings.AGENT_MODEL
        self.mcp_service = AidaMCPService()
        self._initialized = False
        
    async def initialize(self):
        if not self._initialized:
            await self.mcp_service.initialize()
            self._initialized = True
        
    async def cleanup(self):
        if self._initialized:
            await self.mcp_service.cleanup()
            self._initialized = False
        
    def _convert_mcp_tools_to_openai(self) -> List[Dict]:
        mcp_tools = get_tool_definitions()
        openai_tools = []
        for tool in mcp_tools:
            openai_tools.append({
                'type': 'function',
                'function': {
                    'name': tool.name,
                    'description': tool.description,
                    'parameters': tool.inputSchema
                }
            })
        return openai_tools

    def _build_default_system_prompt(self, assessment_context: Dict[str, Any] | None = None) -> str:
        prompt_parts: List[str] = []

        if PREPROMPT_FILE.exists():
            try:
                prompt_parts.append(PREPROMPT_FILE.read_text().strip())
            except Exception as exc:
                logger.warning(f'Failed to read PrePrompt.txt: {exc}')

        if assessment_context:
            name = assessment_context.get('name', 'Unknown')
            aid = assessment_context.get('id')
            container = assessment_context.get('container_name') or self.mcp_service.current_container or 'unknown'
            ip_scopes = assessment_context.get('ip_scopes') or []
            target_domains = assessment_context.get('target_domains') or []
            scope = assessment_context.get('scope') or ''
            category = assessment_context.get('category') or ''

            lines = [
                '## **Current Assessment (auto-loaded, do NOT call load_assessment)**',
                '',
                f'- **Name:** {name}',
                f'- **ID:** {aid}',
                f'- **Category:** {category}',
                f'- **Container:** {container}',
            ]
            if ip_scopes:
                lines.append(f'- **IP Scopes (use these as targets):** {", ".join(ip_scopes)}')
            if target_domains:
                lines.append(f'- **Target Domains:** {", ".join(target_domains)}')
            if scope:
                lines.append(f'- **Scope notes:** {scope}')
            lines += [
                '',
                '**Rules:**',
                '- The assessment is already active. NEVER call `load_assessment` — it will fail if the name does not match exactly.',
                '- Use the IP Scopes above as your attack targets. Do not rely on IPs from old files or scripts.',
                '- If any tool fails, diagnose and try an alternative. Never stop mid-task without attempting recovery.',
                '- Keep working autonomously until all objectives are complete or you hit an unresolvable blocker.',
            ]
            prompt_parts.append("\n".join(lines))

        if not prompt_parts:
            prompt_parts.append(
                'You are AIDA, an expert AI penetration testing assistant. You have access to various tools to scan, execute commands, and record findings. You MUST use these tools when asked to perform a task. Analyze results and give a concise answer.'
            )

        return '\n\n'.join(part for part in prompt_parts if part)

    def _serialize_message(self, message: Any) -> Dict[str, Any]:
        if isinstance(message, dict):
            return message
        if hasattr(message, 'model_dump'):
            return message.model_dump(exclude_none=True)
        return dict(message)

    def _persist_ai_message(
        self,
        assessment_id: int,
        role: str,
        event_type: str,
        content: str | None = None,
        message_payload: Dict[str, Any] | None = None,
        tool_name: str | None = None,
    ) -> AssessmentAIMessage:
        db = SessionLocal()
        try:
            next_sequence = (
                db.query(func.coalesce(func.max(AssessmentAIMessage.sequence_number), 0))
                .filter(AssessmentAIMessage.assessment_id == assessment_id)
                .scalar()
                + 1
            )
            entry = AssessmentAIMessage(
                assessment_id=assessment_id,
                sequence_number=next_sequence,
                role=role,
                event_type=event_type,
                content=content,
                message_payload=message_payload,
                tool_name=tool_name,
            )
            db.add(entry)
            db.commit()
            db.refresh(entry)
            return entry
        finally:
            db.close()

    def _load_context_messages(self, assessment_id: int) -> List[Dict[str, Any]]:
        db = SessionLocal()
        try:
            persisted_messages = (
                db.query(AssessmentAIMessage)
                .filter(
                    AssessmentAIMessage.assessment_id == assessment_id,
                    AssessmentAIMessage.message_payload.isnot(None),
                )
                .order_by(AssessmentAIMessage.sequence_number.asc(), AssessmentAIMessage.id.asc())
                .all()
            )
            payloads = [message.message_payload for message in persisted_messages if message.message_payload]
            if len(payloads) > self.MAX_CONTEXT_MESSAGES:
                payloads = payloads[-self.MAX_CONTEXT_MESSAGES:]
                # 清理开头孤立的 tool 消息（对应的 assistant tool_calls 被截断掉了）
                while payloads and payloads[0].get('role') == 'tool':
                    payloads.pop(0)

            # 清理末尾孤立的 assistant tool_calls 消息：
            # 当用户在工具执行中途插入新消息时，上下文末尾可能留有
            # assistant(tool_calls=[...]) 但没有对应 tool 响应，导致 400。
            # 找到最后一条 assistant 消息，若它有 tool_calls 且其后没有 tool 消息，则移除整个悬空尾巴。
            last_assistant_idx = None
            for i in range(len(payloads) - 1, -1, -1):
                if payloads[i].get('role') == 'assistant':
                    last_assistant_idx = i
                    break
            if last_assistant_idx is not None:
                last_assistant = payloads[last_assistant_idx]
                if last_assistant.get('tool_calls'):
                    # Check if there's at least one tool response after it
                    has_tool_response = any(
                        p.get('role') == 'tool'
                        for p in payloads[last_assistant_idx + 1:]
                    )
                    if not has_tool_response:
                        payloads = payloads[:last_assistant_idx]

            return payloads
        finally:
            db.close()

    async def _load_context_documents(self, assessment_context: Dict[str, Any] | None) -> str:
        """Read all .md files from the assessment's context/ directory via the pentest container."""
        if not assessment_context:
            return ''
        workspace = assessment_context.get('workspace_path')
        container = assessment_context.get('container_name') or self.mcp_service.current_container
        if not workspace or not container:
            return ''
        context_dir = f"{workspace}/context"
        try:
            result = await self.mcp_service._run_command(
                ["docker", "exec", container, "bash", "-c",
                 f"find {context_dir} -name '*.md' -type f 2>/dev/null"]
            )
            files = [l.strip() for l in (result.get('stdout') or '').splitlines() if l.strip()]
            if not files:
                return ''
            parts = []
            for fpath in files:
                res = await self.mcp_service._run_command(
                    ["docker", "exec", container, "bash", "-c", f"cat '{fpath}'"]
                )
                content = res.get('stdout') or ''
                if content:
                    parts.append(f"### {fpath}\n\n{content}")
            if parts:
                return "## **Context Documents (read-only reference)**\n\n" + "\n\n---\n\n".join(parts)
        except Exception as e:
            logger.warning(f'Failed to load context documents: {e}')
        return ''

    async def run_agent_loop(self, assessment_id: int, user_input: str, system_prompt: str = '') -> AsyncGenerator[Dict[str, Any], None]:
        await self.initialize()
        assessment_context = await self.mcp_service.set_active_assessment_context(assessment_id)

        tools = self._convert_mcp_tools_to_openai()

        base_prompt = system_prompt or self._build_default_system_prompt(assessment_context)
        context_docs = await self._load_context_documents(assessment_context)
        system_message = {
            'role': 'system',
            'content': f"{base_prompt}\n\n{context_docs}".strip() if context_docs else base_prompt
        }
        messages = [system_message, *self._load_context_messages(assessment_id)]

        user_message = {'role': 'user', 'content': user_input}
        messages.append(user_message)
        user_entry = self._persist_ai_message(
            assessment_id,
            role='user',
            event_type=EventType.AGENT_INPUT,
            content=user_input,
            message_payload=user_message,
        )
        yield create_event(
            EventType.AGENT_INPUT,
            {
                'id': user_entry.id,
                'sequence_number': user_entry.sequence_number,
                'message': user_input,
                'input': user_input,
            },
            assessment_id=assessment_id,
        )

        max_iterations = 40
        iteration = 0

        while iteration < max_iterations:
            iteration += 1
            logger.info(f'Agent iteration {iteration}', assessment_id=assessment_id)

            thought_text = 'Thinking...'
            thought_entry = self._persist_ai_message(
                assessment_id,
                role='assistant',
                event_type=EventType.AGENT_THOUGHT,
                content=thought_text,
            )
            yield create_event(
                EventType.AGENT_THOUGHT,
                {
                    'id': thought_entry.id,
                    'sequence_number': thought_entry.sequence_number,
                    'message': thought_text,
                    'thought': thought_text,
                },
                assessment_id=assessment_id
            )

            try:
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    tools=tools,
                    tool_choice='auto'
                )
            except Exception as e:
                logger.error(f'LLM API error: {e}')
                error_message = f'Error calling LLM: {str(e)}'
                error_entry = self._persist_ai_message(
                    assessment_id,
                    role='assistant',
                    event_type=EventType.AGENT_ERROR,
                    content=error_message,
                )
                yield create_event(
                    EventType.AGENT_ERROR,
                    {
                        'id': error_entry.id,
                        'sequence_number': error_entry.sequence_number,
                        'message': error_message,
                        'error': error_message,
                    },
                    assessment_id=assessment_id
                )
                break

            response_message = response.choices[0].message
            serialized_response_message = self._serialize_message(response_message)
            messages.append(serialized_response_message)

            assistant_content = response_message.content or ''
            assistant_entry = self._persist_ai_message(
                assessment_id,
                role='assistant',
                event_type=EventType.AGENT_OUTPUT,
                content=assistant_content,
                message_payload=serialized_response_message,
            )

            if response_message.content:
                yield create_event(
                    EventType.AGENT_OUTPUT,
                    {
                        'id': assistant_entry.id,
                        'sequence_number': assistant_entry.sequence_number,
                        'message': response_message.content,
                        'output': response_message.content,
                    },
                    assessment_id=assessment_id
                )

            if not response_message.tool_calls:
                break

            for tool_call in response_message.tool_calls:
                function_name = tool_call.function.name
                function_args_str = tool_call.function.arguments

                try:
                    arguments = json.loads(function_args_str)
                except json.JSONDecodeError:
                    arguments = {}

                exec_message = f'Executing {function_name}...'
                exec_entry = self._persist_ai_message(
                    assessment_id,
                    role='assistant',
                    event_type=EventType.AGENT_EXEC,
                    content=exec_message,
                    tool_name=function_name,
                )
                yield create_event(
                    EventType.AGENT_EXEC,
                    {
                        'id': exec_entry.id,
                        'sequence_number': exec_entry.sequence_number,
                        'tool': function_name,
                        'command': exec_message,
                        'arguments': arguments,
                        'message': exec_message
                    },
                    assessment_id=assessment_id
                )

                logger.info(f'Agent calling tool {function_name}', arguments=arguments, assessment_id=assessment_id)

                try:
                    tool_result_contents = await asyncio.wait_for(
                        handle_tool_call(function_name, arguments, self.mcp_service),
                        timeout=180.0
                    )
                    result_text = '\n'.join([content.text for content in tool_result_contents if content.type == 'text'])

                    output_text = (
                        f'Tool {function_name} result:\n`\n{result_text[:1000]}...\n`'
                        if len(result_text) > 1000
                        else f'Tool {function_name} result:\n`\n{result_text}\n`'
                    )
                    tool_message = {
                        'tool_call_id': tool_call.id,
                        'role': 'tool',
                        'name': function_name,
                        'content': result_text
                    }
                    messages.append(tool_message)
                    tool_entry = self._persist_ai_message(
                        assessment_id,
                        role='tool',
                        event_type=EventType.AGENT_OUTPUT,
                        content=output_text,
                        message_payload=tool_message,
                        tool_name=function_name,
                    )

                    yield create_event(
                        EventType.AGENT_OUTPUT,
                        {
                            'id': tool_entry.id,
                            'sequence_number': tool_entry.sequence_number,
                            'message': output_text,
                            'output': output_text,
                            'tool': function_name,
                        },
                        assessment_id=assessment_id
                    )

                except asyncio.TimeoutError:
                    logger.error(f'Tool execution timeout: {function_name}')
                    result_text = f'Tool {function_name} timed out after 120 seconds.'
                    tool_message = {
                        'tool_call_id': tool_call.id,
                        'role': 'tool',
                        'name': function_name,
                        'content': result_text
                    }
                    messages.append(tool_message)
                    error_entry = self._persist_ai_message(
                        assessment_id,
                        role='tool',
                        event_type=EventType.AGENT_ERROR,
                        content=result_text,
                        message_payload=tool_message,
                        tool_name=function_name,
                    )
                    yield create_event(
                        EventType.AGENT_ERROR,
                        {
                            'id': error_entry.id,
                            'sequence_number': error_entry.sequence_number,
                            'message': result_text,
                            'error': result_text,
                            'tool': function_name,
                        },
                        assessment_id=assessment_id
                    )

                except Exception as e:
                    logger.error(f'Tool execution error: {e}', exc_info=True)
                    result_text = f'Error executing tool {function_name}: {str(e)}'
                    tool_message = {
                        'tool_call_id': tool_call.id,
                        'role': 'tool',
                        'name': function_name,
                        'content': result_text
                    }
                    messages.append(tool_message)
                    error_entry = self._persist_ai_message(
                        assessment_id,
                        role='tool',
                        event_type=EventType.AGENT_ERROR,
                        content=result_text,
                        message_payload=tool_message,
                        tool_name=function_name,
                    )
                    yield create_event(
                        EventType.AGENT_ERROR,
                        {
                            'id': error_entry.id,
                            'sequence_number': error_entry.sequence_number,
                            'message': result_text,
                            'error': result_text,
                            'tool': function_name,
                        },
                        assessment_id=assessment_id
                    )

        done_text = 'Task completed.'
        done_entry = self._persist_ai_message(
            assessment_id,
            role='assistant',
            event_type=EventType.AGENT_DONE,
            content=done_text,
        )
        yield create_event(
            EventType.AGENT_DONE,
            {
                'id': done_entry.id,
                'sequence_number': done_entry.sequence_number,
                'message': done_text,
            },
            assessment_id=assessment_id,
        )

agent_service = AIAgentService()
