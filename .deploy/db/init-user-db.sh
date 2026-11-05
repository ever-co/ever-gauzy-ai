#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$DB_USER" --dbname "$DB_NAME" <<-EOSQL
	CREATE DATABASE gauzy_ai;
	GRANT ALL PRIVILEGES ON DATABASE gauzy_ai TO postgres;
EOSQL
