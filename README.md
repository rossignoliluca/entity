# Entity

Autopoietic entity system conforming to AES-SPEC-001.

## Structure

```
ORGANIZATION.sha256       # Organization hash (immutable)
spec/SPECIFICATION.md     # ISO formal specification

SYSTEM.md                 # Operational description
state/current.json        # Current state
events/                   # Event log (Merkle chain)

src/                      # Implementation
test/                     # Tests
```

## Requirements

- Node.js 20+
- npm 10+

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
# Verify system integrity
npm run verify

# Start session
npm run session

# Run tests
npm test
```

## Specification

See `spec/SPECIFICATION.md` for the complete ISO-compliant formal specification.

Key properties:
- 55 definitions (DEF-001 to DEF-055)
- 18 axioms (AXM-001 to AXM-018)
- 10 theorems (THM-001 to THM-010)
- 3 conformance levels

## Constitutive Constraint

**No action or inaction shall reduce the weighted possibility space of any being.**

## License

Proprietary. All rights reserved.

## Version

1.0.0
