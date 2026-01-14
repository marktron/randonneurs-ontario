#!/bin/bash

# Validate all chapters and years, saving reports to validation-reports/
# Usage: ./scripts/validate-all.sh [-v]

set -e

VERBOSE=""
if [[ "$1" == "-v" || "$1" == "--verbose" ]]; then
  VERBOSE="-v"
fi

REPORT_DIR="validation-reports"
mkdir -p "$REPORT_DIR"

echo "Starting batch validation..."
echo ""

# Toronto: 1997-2018
for year in $(seq 1997 2018); do
  echo "Validating toronto $year..."
  npm run validate --silent -- -c toronto -y "$year" -o markdown $VERBOSE > "$REPORT_DIR/$year-toronto-validation-report.md" || echo "  Failed for toronto $year"
done

# Ottawa: 1999-2025
for year in $(seq 1999 2025); do
  echo "Validating ottawa $year..."
  npm run validate --silent -- -c ottawa -y "$year" -o markdown $VERBOSE > "$REPORT_DIR/$year-ottawa-validation-report.md" || echo "  Failed for ottawa $year"
done

# Simcoe: 2001-2025
for year in $(seq 2001 2025); do
  echo "Validating simcoe $year..."
  npm run validate --silent -- -c simcoe -y "$year" -o markdown $VERBOSE > "$REPORT_DIR/$year-simcoe-validation-report.md" || echo "  Failed for simcoe $year"
done

# Huron: 2004-2025
for year in $(seq 2004 2025); do
  echo "Validating huron $year..."
  npm run validate --silent -- -c huron -y "$year" -o markdown $VERBOSE > "$REPORT_DIR/$year-huron-validation-report.md" || echo "  Failed for huron $year"
done

# Niagara: 2005-2006
for year in $(seq 2005 2006); do
  echo "Validating niagara $year..."
  npm run validate --silent -- -c niagara -y "$year" -o markdown $VERBOSE > "$REPORT_DIR/$year-niagara-validation-report.md" || echo "  Failed for niagara $year"
done

# Permanents: 2013-2025
for year in $(seq 2013 2025); do
  echo "Validating permanent $year..."
  npm run validate --silent -- -c permanent -y "$year" -o markdown $VERBOSE > "$REPORT_DIR/$year-permanent-validation-report.md" || echo "  Failed for permanent $year"
done

echo ""
echo "Done! Reports saved to $REPORT_DIR/"
echo ""
ls -la "$REPORT_DIR" | head -20
