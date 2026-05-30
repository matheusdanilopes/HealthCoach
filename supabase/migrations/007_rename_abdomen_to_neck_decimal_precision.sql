-- Rename abdomen column to neck and increase decimal precision to 2 places
ALTER TABLE body_measurements RENAME COLUMN abdomen TO neck;

ALTER TABLE body_measurements
  ALTER COLUMN waist       TYPE NUMERIC(6,2),
  ALTER COLUMN neck        TYPE NUMERIC(6,2),
  ALTER COLUMN hips        TYPE NUMERIC(6,2),
  ALTER COLUMN chest       TYPE NUMERIC(6,2),
  ALTER COLUMN right_arm   TYPE NUMERIC(6,2),
  ALTER COLUMN left_arm    TYPE NUMERIC(6,2),
  ALTER COLUMN right_thigh TYPE NUMERIC(6,2),
  ALTER COLUMN left_thigh  TYPE NUMERIC(6,2),
  ALTER COLUMN right_calf  TYPE NUMERIC(6,2),
  ALTER COLUMN left_calf   TYPE NUMERIC(6,2);
