// Minimal in-memory fake of the subset of the Prisma Client used by
// src/lib/server/training-automation.ts, so the automation runner can be
// exercised end-to-end (planner + writer + settings persistence) without a
// real database. Intentionally narrow: add methods here only as tests need
// them, matching the exact shape the real client would return.

const selectFields = (record, select) => {
  if (!select) {
    return { ...record };
  }

  const out = {};
  for (const key of Object.keys(select)) {
    if (select[key]) {
      out[key] = record[key];
    }
  }
  return out;
};

const matchesCondition = (value, condition) => {
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    if ("in" in condition) {
      return condition.in.includes(value);
    }
  }
  return value === condition;
};

const matchesWhere = (record, where = {}) =>
  Object.entries(where).every(([key, condition]) =>
    matchesCondition(record[key], condition),
  );

const makeCollection = (state, key) => ({
  findMany: async ({ where, select } = {}) =>
    state[key].filter((record) => matchesWhere(record, where)).map((record) =>
      selectFields(record, select),
    ),
});

export function createFakePrisma(seed = {}) {
  const state = {
    club: (seed.club || []).map((record) => ({ ...record })),
    clubResourceItem: (seed.clubResourceItem || []).map((record) => ({ ...record })),
    athlete: (seed.athlete || []).map((record) => ({ ...record })),
    athleteCategoryMembership: (seed.athleteCategoryMembership || []).map((record) => ({
      ...record,
    })),
  };

  return {
    __state: state,
    club: {
      findUnique: async ({ where, select }) => {
        const record = state.club.find((c) => c.id === where.id);
        return record ? selectFields(record, select) : null;
      },
      ...makeCollection(state, "club"),
      update: async ({ where, data }) => {
        const index = state.club.findIndex((c) => c.id === where.id);
        if (index === -1) {
          throw new Error(`Fake prisma: club ${where.id} not found`);
        }
        state.club[index] = { ...state.club[index], ...data };
        return { ...state.club[index] };
      },
    },
    clubResourceItem: makeCollection(state, "clubResourceItem"),
    athlete: makeCollection(state, "athlete"),
    athleteCategoryMembership: makeCollection(state, "athleteCategoryMembership"),
  };
}

/**
 * Wraps a fake prisma client so `club.update` throws once (or every time,
 * with `times: Infinity`), to simulate a writer/persistence failure without
 * touching the real generation logic.
 */
export function withFailingClubUpdate(fakePrisma, { error, times = 1 } = {}) {
  let remaining = times;
  const realUpdate = fakePrisma.club.update.bind(fakePrisma.club);

  return {
    ...fakePrisma,
    club: {
      ...fakePrisma.club,
      update: async (...args) => {
        if (remaining > 0) {
          remaining -= 1;
          throw error || new Error("Fake prisma: simulated writer failure");
        }
        return realUpdate(...args);
      },
    },
  };
}
