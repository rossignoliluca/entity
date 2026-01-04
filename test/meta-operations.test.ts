/**
 * Meta-Operations Tests
 * AES-SPEC-001 Phase 7a: Self-Production (DEF-007)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  defineOperation,
  composeOperations,
  specializeOperation,
  listGeneratedOperations,
  getAutopoiesisStats,
  getCombinedCatalog,
  getDynamicOperation,
  getAllOperations,
  META_OPERATIONS_CATALOG,
  normalizeOperation,
  type HandlerTemplate,
  type AutopoiesisState,
  type GeneratedOperationDef,
} from '../src/meta-operations.js';
import { OPERATIONS_CATALOG } from '../src/operations.js';
import type { State } from '../src/types.js';

// Helper to create mock state
function createState(): State {
  return {
    version: '1.0.0',
    specification: 'AES-SPEC-001',
    organization_hash: 'test-org-hash-123456789abcdef',
    created: '2025-01-04T00:00:00.000Z',
    updated: '2025-01-04T12:00:00.000Z',
    identity: { name: 'Entity', instantiated_by: 'Test', instantiated_at: '2025-01-04T00:00:00.000Z' },
    coupling: { active: true, partner: 'Test', since: '2025-01-04T12:00:00.000Z' },
    energy: { current: 0.5, min: 0.01, threshold: 0.1 },
    lyapunov: { V: 0, V_previous: null },
    memory: { event_count: 1, last_event_hash: 'test', last_snapshot_at: null },
    session: { total_count: 5, current_id: 'test-session' },
    integrity: { invariant_violations: 0, last_verification: '2025-01-04T00:00:00.000Z', status: 'nominal' },
    human: { name: 'Test', context: '' },
    important: [],
    learning: { enabled: true, lastAnalysis: null, patternsHash: null },
  };
}

// Helper to create a mock generated operation with quarantine fields
function mockOp(partial: Partial<GeneratedOperationDef> & { id: string }): GeneratedOperationDef {
  return normalizeOperation(partial);
}

// Helper to create state with autopoiesis
function createStateWithAutopoiesis(genOps: Array<Partial<GeneratedOperationDef> & { id: string }> = []): State & { autopoiesis: AutopoiesisState } {
  const state = createState();
  return {
    ...state,
    autopoiesis: {
      enabled: true,
      generatedOperations: genOps.map(op => mockOp(op)),
      generationCount: genOps.length,
      lastGeneration: genOps.length > 0 ? new Date().toISOString() : null,
      selfProductionHash: null,
    },
  };
}

describe('defineOperation', () => {
  it('should define a new operation', () => {
    const state = createState();
    const result = defineOperation(state, {
      id: 'custom.test',
      name: 'Test Operation',
      description: 'A test operation',
      template: 'echo',
      templateParams: { message: 'Hello' },
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.generatedOperation);
    assert.strictEqual(result.generatedOperation?.id, 'custom.test');
    assert.strictEqual(result.generatedOperation?.template, 'echo');
    assert.strictEqual(result.generatedOperation?.generation, 1);
  });

  it('should reject duplicate operation IDs', () => {
    const state = createStateWithAutopoiesis([{
      id: 'existing.op',
      name: 'Existing',
      description: 'Already exists',
      category: 'generated',
      complexity: 1,
      energyCost: 0.01,
      requiresCoupling: true,
      template: 'echo',
      templateParams: {},
      generatedBy: 'meta.define',
      generatedAt: new Date().toISOString(),
      generation: 1,
    }]);

    const result = defineOperation(state, {
      id: 'existing.op',
      name: 'Duplicate',
      description: 'Should fail',
      template: 'echo',
      templateParams: {},
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('already exists'));
  });

  it('should reject catalog operation IDs', () => {
    const state = createState();
    const result = defineOperation(state, {
      id: 'state.read', // Exists in catalog
      name: 'Duplicate',
      description: 'Should fail',
      template: 'echo',
      templateParams: {},
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('base catalog'));
  });

  it('should update autopoiesis state', () => {
    const state = createState();
    const result = defineOperation(state, {
      id: 'custom.new',
      name: 'New Op',
      description: 'A new operation',
      template: 'echo',
      templateParams: {},
    });

    assert.ok(result.stateChanges);
    const autopoiesis = (result.stateChanges as { autopoiesis: AutopoiesisState }).autopoiesis;
    assert.strictEqual(autopoiesis.generatedOperations.length, 1);
    assert.strictEqual(autopoiesis.generationCount, 1);
    assert.ok(autopoiesis.selfProductionHash);
  });
});

describe('composeOperations', () => {
  it('should compose existing operations', () => {
    const state = createState();
    const result = composeOperations(state, {
      id: 'combined.status',
      name: 'Combined Status',
      description: 'Combines state.read and energy.status',
      operations: ['state.read', 'energy.status'],
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.stateChanges);
  });

  it('should fail for non-existent source operations', () => {
    const state = createState();
    const result = composeOperations(state, {
      id: 'bad.compose',
      name: 'Bad Compose',
      description: 'Should fail',
      operations: ['state.read', 'nonexistent.op'],
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('not found'));
  });

  it('should calculate complexity from components', () => {
    const state = createState();
    const op1 = OPERATIONS_CATALOG['state.read'];
    const op2 = OPERATIONS_CATALOG['energy.status'];
    const expectedComplexity = (op1?.complexity || 0) + (op2?.complexity || 0);

    const result = composeOperations(state, {
      id: 'combined.test',
      name: 'Combined Test',
      description: 'Test',
      operations: ['state.read', 'energy.status'],
    });

    assert.strictEqual(result.success, true);
    // Complexity should be sum of components
    const autopoiesis = (result.stateChanges as { autopoiesis: AutopoiesisState }).autopoiesis;
    const genOp = autopoiesis.generatedOperations.find((o) => o.id === 'combined.test');
    assert.strictEqual(genOp?.complexity, expectedComplexity);
  });
});

describe('specializeOperation', () => {
  it('should specialize catalog operation', () => {
    const state = createState();
    const result = specializeOperation(state, {
      id: 'greet.luca',
      name: 'Greet Luca',
      description: 'Specialized greeting',
      sourceOperation: 'interaction.greet',
      presetParams: { target: 'Luca' },
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.stateChanges);
  });

  it('should fail for non-existent source', () => {
    const state = createState();
    const result = specializeOperation(state, {
      id: 'spec.fail',
      name: 'Fail',
      description: 'Should fail',
      sourceOperation: 'nonexistent.op',
      presetParams: {},
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('not found'));
  });
});

describe('listGeneratedOperations', () => {
  it('should return empty for new state', () => {
    const state = createState();
    const ops = listGeneratedOperations(state);
    assert.strictEqual(ops.length, 0);
  });

  it('should return generated operations', () => {
    const state = createStateWithAutopoiesis([
      {
        id: 'gen.op1',
        name: 'Gen Op 1',
        description: 'First generated',
        category: 'generated',
        complexity: 1,
        energyCost: 0.01,
        requiresCoupling: true,
        template: 'echo',
        templateParams: {},
        generatedBy: 'meta.define',
        generatedAt: new Date().toISOString(),
        generation: 1,
      },
      {
        id: 'gen.op2',
        name: 'Gen Op 2',
        description: 'Second generated',
        category: 'generated',
        complexity: 2,
        energyCost: 0.02,
        requiresCoupling: true,
        template: 'echo',
        templateParams: {},
        generatedBy: 'meta.define',
        generatedAt: new Date().toISOString(),
        generation: 1,
      },
    ]);

    const ops = listGeneratedOperations(state);
    assert.strictEqual(ops.length, 2);
    assert.strictEqual(ops[0].id, 'gen.op1');
    assert.strictEqual(ops[1].id, 'gen.op2');
  });
});

describe('getAutopoiesisStats', () => {
  it('should show not autopoietic when no generated ops', () => {
    const state = createState();
    const stats = getAutopoiesisStats(state);

    assert.strictEqual(stats.satisfiesDEF007, false);
    assert.strictEqual(stats.generatedOperations, 0);
    assert.ok(stats.baseOperations > 0);
  });

  it('should show autopoietic when ops exist', () => {
    const state = createStateWithAutopoiesis([{
      id: 'gen.op',
      name: 'Generated',
      description: 'A generated operation',
      category: 'generated',
      complexity: 1,
      energyCost: 0.01,
      requiresCoupling: true,
      template: 'echo',
      templateParams: {},
      generatedBy: 'meta.define',
      generatedAt: new Date().toISOString(),
      generation: 1,
    }]);

    const stats = getAutopoiesisStats(state);

    assert.strictEqual(stats.satisfiesDEF007, true);
    assert.strictEqual(stats.generatedOperations, 1);
    assert.strictEqual(stats.totalOperations, stats.baseOperations + 1);
  });

  it('should calculate max generation', () => {
    const state = createStateWithAutopoiesis([
      {
        id: 'gen.op1',
        name: 'Gen 1',
        description: 'First gen',
        category: 'generated',
        complexity: 1,
        energyCost: 0.01,
        requiresCoupling: true,
        template: 'echo',
        templateParams: {},
        generatedBy: 'meta.define',
        generatedAt: new Date().toISOString(),
        generation: 1,
      },
      {
        id: 'gen.op2',
        name: 'Gen 2',
        description: 'Second gen',
        category: 'generated',
        complexity: 1,
        energyCost: 0.01,
        requiresCoupling: true,
        template: 'compose',
        templateParams: { operations: ['gen.op1'] },
        generatedBy: 'meta.compose',
        generatedAt: new Date().toISOString(),
        parentOperations: ['gen.op1'],
        generation: 2,
      },
      {
        id: 'gen.op3',
        name: 'Gen 3',
        description: 'Third gen',
        category: 'generated',
        complexity: 1,
        energyCost: 0.01,
        requiresCoupling: true,
        template: 'compose',
        templateParams: { operations: ['gen.op2'] },
        generatedBy: 'meta.compose',
        generatedAt: new Date().toISOString(),
        parentOperations: ['gen.op2'],
        generation: 3,
      },
    ]);

    const stats = getAutopoiesisStats(state);
    assert.strictEqual(stats.maxGeneration, 3);
  });
});

describe('getDynamicOperation', () => {
  it('should return undefined for non-existent op', () => {
    const state = createState();
    const op = getDynamicOperation('nonexistent', state);
    assert.strictEqual(op, undefined);
  });

  it('should return operation with handler', () => {
    const state = createStateWithAutopoiesis([{
      id: 'dynamic.echo',
      name: 'Dynamic Echo',
      description: 'A dynamic echo operation',
      category: 'generated',
      complexity: 1,
      energyCost: 0.01,
      requiresCoupling: false,
      template: 'echo',
      templateParams: { message: 'Hello from dynamic op' },
      generatedBy: 'meta.define',
      generatedAt: new Date().toISOString(),
      generation: 1,
    }]);

    const op = getDynamicOperation('dynamic.echo', state);
    assert.ok(op);
    assert.strictEqual(op.id, 'dynamic.echo');
    assert.ok(typeof op.handler === 'function');

    // Execute handler
    const result = op.handler(state, {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.effects?.echo, true);
  });
});

describe('getAllOperations', () => {
  it('should include catalog and dynamic operations', () => {
    const state = createStateWithAutopoiesis([{
      id: 'dynamic.op',
      name: 'Dynamic',
      description: 'A dynamic operation',
      category: 'generated',
      complexity: 1,
      energyCost: 0.01,
      requiresCoupling: false,
      template: 'echo',
      templateParams: {},
      generatedBy: 'meta.define',
      generatedAt: new Date().toISOString(),
      generation: 1,
    }]);

    const allOps = getAllOperations(state);
    const catalogOps = Object.values(OPERATIONS_CATALOG);

    assert.strictEqual(allOps.length, catalogOps.length + 1);
    assert.ok(allOps.some((op) => op.id === 'dynamic.op'));
    assert.ok(allOps.some((op) => op.id === 'state.read'));
  });
});

describe('getCombinedCatalog', () => {
  it('should include base, meta, and generated operations', () => {
    const state = createStateWithAutopoiesis([{
      id: 'gen.op',
      name: 'Generated',
      description: 'A generated operation',
      category: 'generated',
      complexity: 1,
      energyCost: 0.01,
      requiresCoupling: false,
      template: 'echo',
      templateParams: {},
      generatedBy: 'meta.define',
      generatedAt: new Date().toISOString(),
      generation: 1,
    }]);

    const combined = getCombinedCatalog(state);
    const baseCount = Object.keys(OPERATIONS_CATALOG).length;
    const metaCount = Object.keys(META_OPERATIONS_CATALOG).length;

    assert.strictEqual(Object.keys(combined).length, baseCount + metaCount + 1);
    assert.ok('state.read' in combined);
    assert.ok('meta.define' in combined);
    assert.ok('gen.op' in combined);
  });
});

describe('META_OPERATIONS_CATALOG', () => {
  it('should contain P set operations', () => {
    assert.ok('meta.define' in META_OPERATIONS_CATALOG);
    assert.ok('meta.compose' in META_OPERATIONS_CATALOG);
    assert.ok('meta.specialize' in META_OPERATIONS_CATALOG);
    assert.ok('meta.list' in META_OPERATIONS_CATALOG);
    assert.ok('meta.introspect' in META_OPERATIONS_CATALOG);
  });

  it('meta.define should have correct structure', () => {
    const op = META_OPERATIONS_CATALOG['meta.define'];
    assert.strictEqual(op.id, 'meta.define');
    assert.strictEqual(op.category, 'system');
    assert.ok(op.energyCost > 0);
    assert.strictEqual(op.requiresCoupling, true);
  });

  it('meta.introspect should work', () => {
    const state = createState();
    const op = META_OPERATIONS_CATALOG['meta.introspect'];
    const result = op.handler(state, {});

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.effects?.satisfiesDEF007, false);
  });
});

describe('Template handlers', () => {
  describe('echo template', () => {
    it('should echo input', () => {
      const state = createState();
      defineOperation(state, {
        id: 'test.echo',
        name: 'Test Echo',
        description: 'Test',
        template: 'echo',
        templateParams: { message: 'Test message' },
      });

      const stateWithOp = createStateWithAutopoiesis([{
        id: 'test.echo',
        name: 'Test Echo',
        description: 'Test',
        category: 'generated',
        complexity: 5,
        energyCost: 0.01,
        requiresCoupling: true,
        template: 'echo',
        templateParams: { message: 'Test message' },
        generatedBy: 'meta.define',
        generatedAt: new Date().toISOString(),
        generation: 1,
      }]);

      const op = getDynamicOperation('test.echo', stateWithOp);
      assert.ok(op);

      const result = op.handler(stateWithOp, { foo: 'bar' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.message, 'Test message');
      assert.deepStrictEqual(result.effects?.input, { foo: 'bar' });
    });
  });

  describe('read_field template', () => {
    it('should read state field', () => {
      const state = createStateWithAutopoiesis([{
        id: 'read.energy',
        name: 'Read Energy',
        description: 'Read energy field',
        category: 'generated',
        complexity: 1,
        energyCost: 0.001,
        requiresCoupling: false,
        template: 'read_field',
        templateParams: { field: 'energy.current' },
        generatedBy: 'meta.define',
        generatedAt: new Date().toISOString(),
        generation: 1,
      }]);

      const op = getDynamicOperation('read.energy', state);
      assert.ok(op);

      const result = op.handler(state, {});
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.effects?.['energy.current'], 0.5);
    });
  });

  describe('aggregate template', () => {
    it('should aggregate multiple fields', () => {
      const state = createStateWithAutopoiesis([{
        id: 'aggregate.status',
        name: 'Aggregate Status',
        description: 'Aggregate status fields',
        category: 'generated',
        complexity: 2,
        energyCost: 0.002,
        requiresCoupling: false,
        template: 'aggregate',
        templateParams: { fields: ['energy.current', 'lyapunov.V', 'integrity.status'] },
        generatedBy: 'meta.define',
        generatedAt: new Date().toISOString(),
        generation: 1,
      }]);

      const op = getDynamicOperation('aggregate.status', state);
      assert.ok(op);

      const result = op.handler(state, {});
      assert.strictEqual(result.success, true);
      assert.ok(result.effects?.aggregation);
      const agg = result.effects.aggregation as Record<string, unknown>;
      assert.strictEqual(agg['energy.current'], 0.5);
      assert.strictEqual(agg['lyapunov.V'], 0);
      assert.strictEqual(agg['integrity.status'], 'nominal');
    });
  });
});

describe('DEF-007 Compliance', () => {
  it('should satisfy DEF-007 after first generation', () => {
    const state = createState();

    // Before generation
    const statsBefore = getAutopoiesisStats(state);
    assert.strictEqual(statsBefore.satisfiesDEF007, false);

    // Generate first operation
    const result = defineOperation(state, {
      id: 'first.gen',
      name: 'First Generation',
      description: 'The first self-produced operation',
      template: 'echo',
      templateParams: { message: 'I exist!' },
    });

    assert.strictEqual(result.success, true);

    // Create state with the generated operation
    const stateAfter = createStateWithAutopoiesis([result.generatedOperation!]);

    // After generation
    const statsAfter = getAutopoiesisStats(stateAfter);
    assert.strictEqual(statsAfter.satisfiesDEF007, true);
    assert.strictEqual(statsAfter.generatedOperations, 1);
  });

  it('should track generation lineage', () => {
    // First generation
    const state1 = createStateWithAutopoiesis([{
      id: 'gen1.op',
      name: 'Gen 1',
      description: 'First generation',
      category: 'generated',
      complexity: 1,
      energyCost: 0.01,
      requiresCoupling: false,
      template: 'echo',
      templateParams: {},
      generatedBy: 'meta.define',
      generatedAt: new Date().toISOString(),
      generation: 1,
    }]);

    // Compose from first generation (should be gen 2)
    const composeResult = composeOperations(state1, {
      id: 'gen2.composed',
      name: 'Gen 2 Composed',
      description: 'Composed from gen 1',
      operations: ['gen1.op'],
    });

    assert.strictEqual(composeResult.success, true);
    // The composition inherits the template and should work
  });
});
