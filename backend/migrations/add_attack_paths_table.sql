-- Add attack_paths table for storing attack path relationships
-- This migration can be run manually if needed, or tables will be auto-created on backend restart

CREATE TABLE IF NOT EXISTS attack_paths (
    id SERIAL PRIMARY KEY,
    assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,

    -- Source and target nodes
    source_type VARCHAR(50) NOT NULL,
    source_id VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(100) NOT NULL,

    -- Attack vector information
    vector_type VARCHAR(100) NOT NULL,
    confidence FLOAT DEFAULT 1.0,
    status VARCHAR(50) DEFAULT 'manual',

    -- Additional information
    reasoning TEXT,
    extra_data JSONB,

    -- Audit fields
    created_by VARCHAR(100),
    confirmed_by VARCHAR(100),
    confirmed_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on assessment_id for faster queries
CREATE INDEX IF NOT EXISTS idx_attack_paths_assessment_id ON attack_paths(assessment_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_attack_paths_status ON attack_paths(status);
