-- Add is_team_captain to registrations for fleche team registration
-- team_name column already exists from 20260306120000_add_fleche_support.sql
ALTER TABLE registrations ADD COLUMN is_team_captain BOOLEAN DEFAULT FALSE;
