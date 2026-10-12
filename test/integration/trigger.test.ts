// Trigger-Tests: enforce_single_active_vorgang
// Deckt alle 6 SQLSTATE-Codes P0001–P0006 ab plus die erlaubten Übergänge.
// Kanonische Code-Liste: docs/Reference.md.

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import {
  startTestDatabase,
  stopTestDatabase,
  truncateUserData,
  makeCompany,
  makeUser,
  getChainId,
  makeMarket,
  insertAction,
  isPostgresError,
  type TestContext,
} from "../helpers/db";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await startTestDatabase();
}, 180_000);

afterAll(async () => {
  if (ctx) await stopTestDatabase(ctx);
});

beforeEach(async () => {
  await truncateUserData(ctx);
});

async function expectPgCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`expected Postgres error ${code}, but no error was thrown`);
  } catch (err) {
    if (!isPostgresError(err))
      throw new Error(`expected PostgresError, got: ${String(err)}`);
    expect(err.code).toBe(code);
  }
}

async function fixture() {
  const companyId = await makeCompany(ctx);
  const userId = await makeUser(ctx, { companyId });
  const chainId = await getChainId(ctx);
  const marketId = await makeMarket(ctx, { companyId, chainId });
  return { companyId, userId, chainId, marketId };
}

// =============================================================================
// ERLAUBTE ÜBERGÄNGE (alles muss durchgehen)
// =============================================================================
describe("Trigger — erlaubte Übergänge", () => {
  it("visit/success auf grünem Markt → gelb", async () => {
    const { marketId, userId } = await fixture();
    const id = await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "success",
      resultingStatus: "gelb",
    });
    expect(id).toBeTruthy();
  });

  it("visit/escalation auf grünem Markt → rosa", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "escalation",
      resultingStatus: "rosa",
    });
  });

  it("visit/no_contact auf grünem Markt → rot mit Cooldown", async () => {
    const { marketId, userId } = await fixture();
    const cooldown = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "no_contact",
      resultingStatus: "rot",
      cooldownUntil: cooldown,
    });
  });

  it("delivery auf gelb → orange", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "success",
      resultingStatus: "gelb",
    });
    await insertAction(ctx, {
      marketId,
      userId,
      type: "delivery",
      resultingStatus: "orange",
    });
  });

  it("cancel_order auf gelb → grün (mit reason)", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "success",
      resultingStatus: "gelb",
    });
    await insertAction(ctx, {
      marketId,
      userId,
      type: "cancel_order",
      resultingStatus: "gruen",
      payload: { reason: "Kunde hat storniert" },
    });
  });

  it("control/ok auf orange → rot mit Cooldown", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "success",
      resultingStatus: "gelb",
    });
    await insertAction(ctx, {
      marketId,
      userId,
      type: "delivery",
      resultingStatus: "orange",
    });
    await insertAction(ctx, {
      marketId,
      userId,
      type: "control",
      result: "ok",
      resultingStatus: "rot",
      cooldownUntil: new Date(Date.now() + 21 * 24 * 3600 * 1000),
    });
  });

  it("control/problem auf orange → gelb", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "success",
      resultingStatus: "gelb",
    });
    await insertAction(ctx, {
      marketId,
      userId,
      type: "delivery",
      resultingStatus: "orange",
    });
    await insertAction(ctx, {
      marketId,
      userId,
      type: "control",
      result: "problem",
      resultingStatus: "gelb",
      payload: { problem_description: "Aufsteller umgekippt" },
    });
  });

  it("profi_visit/success auf rosa → gelb", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "escalation",
      resultingStatus: "rosa",
    });
    await insertAction(ctx, {
      marketId,
      userId,
      type: "profi_visit",
      result: "success",
      resultingStatus: "gelb",
    });
  });

  it("profi_visit/declined auf rosa → rot", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "escalation",
      resultingStatus: "rosa",
    });
    await insertAction(ctx, {
      marketId,
      userId,
      type: "profi_visit",
      result: "declined",
      resultingStatus: "rot",
      cooldownUntil: new Date(Date.now() + 60 * 24 * 3600 * 1000),
    });
  });

  it("visit auf rot mit abgelaufenem Cooldown → gelb", async () => {
    const { marketId, userId } = await fixture();
    const past = new Date(Date.now() - 60_000);
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "no_contact",
      resultingStatus: "rot",
      cooldownUntil: past,
    });
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "success",
      resultingStatus: "gelb",
    });
  });

  it("manual_override darf auf grünem Markt", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "manual_override",
      resultingStatus: "rot",
      payload: { target_status: "rot", reason: "Admin sperrt" },
    });
  });

  it("manual_override darf auf grauem Markt (Wiederaktivierung-Kontext)", async () => {
    const { marketId, userId } = await fixture();
    await ctx.pool.query("UPDATE market SET active = FALSE WHERE id = $1", [marketId]);
    await insertAction(ctx, {
      marketId,
      userId,
      type: "manual_override",
      resultingStatus: "gruen",
      payload: { target_status: "gruen", reason: "Reaktivierung" },
    });
  });

  it("manual_override darf auf rot mit aktivem Cooldown", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "declined",
      resultingStatus: "rot",
      cooldownUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    });
    await insertAction(ctx, {
      marketId,
      userId,
      type: "manual_override",
      resultingStatus: "gruen",
      payload: { target_status: "gruen", reason: "Cooldown aufheben" },
    });
  });
});

// =============================================================================
// P0001 — aktiver Vorgang (Gelb/Orange/Rosa) verhindert falsche Aktion
// =============================================================================
describe("Trigger — P0001 (aktiver Vorgang)", () => {
  it("visit auf gelb → P0001", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "success",
      resultingStatus: "gelb",
    });
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "visit",
        result: "success",
        resultingStatus: "gelb",
      }),
      "P0001",
    );
  });

  it("visit auf orange → P0001", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "success",
      resultingStatus: "gelb",
    });
    await insertAction(ctx, {
      marketId,
      userId,
      type: "delivery",
      resultingStatus: "orange",
    });
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "visit",
        result: "success",
        resultingStatus: "gelb",
      }),
      "P0001",
    );
  });

  it("visit auf rosa → P0001", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "escalation",
      resultingStatus: "rosa",
    });
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "visit",
        result: "success",
        resultingStatus: "gelb",
      }),
      "P0001",
    );
  });

  it("profi_visit auf gelb → P0001", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "success",
      resultingStatus: "gelb",
    });
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "profi_visit",
        result: "success",
        resultingStatus: "gelb",
      }),
      "P0001",
    );
  });

  it("delivery auf rosa → P0001", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "escalation",
      resultingStatus: "rosa",
    });
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "delivery",
        resultingStatus: "orange",
      }),
      "P0001",
    );
  });

  it("control auf gelb → P0001", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "success",
      resultingStatus: "gelb",
    });
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "control",
        result: "ok",
        resultingStatus: "rot",
      }),
      "P0001",
    );
  });

  it("cancel_order auf orange → P0001", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "success",
      resultingStatus: "gelb",
    });
    await insertAction(ctx, {
      marketId,
      userId,
      type: "delivery",
      resultingStatus: "orange",
    });
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "cancel_order",
        resultingStatus: "gruen",
        payload: { reason: "Test" },
      }),
      "P0001",
    );
  });
});

// =============================================================================
// P0002 — Cooldown läuft
// =============================================================================
describe("Trigger — P0002 (Cooldown läuft)", () => {
  it("visit auf rot mit aktivem Cooldown → P0002", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "declined",
      resultingStatus: "rot",
      cooldownUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    });
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "visit",
        result: "success",
        resultingStatus: "gelb",
      }),
      "P0002",
    );
  });
});

// =============================================================================
// P0003 — Markt gemergt
// =============================================================================
describe("Trigger — P0003 (Markt gemergt)", () => {
  it("Action auf gemergten Markt → P0003 (auch manual_override)", async () => {
    const { companyId, userId, chainId } = await fixture();
    const primaryId = await makeMarket(ctx, { companyId, chainId });
    const duplicateId = await makeMarket(ctx, { companyId, chainId });
    await ctx.pool.query(
      "UPDATE market SET active = FALSE, merged_into_id = $1 WHERE id = $2",
      [primaryId, duplicateId],
    );

    await expectPgCode(
      insertAction(ctx, {
        marketId: duplicateId,
        userId,
        type: "visit",
        result: "success",
        resultingStatus: "gelb",
      }),
      "P0003",
    );

    await expectPgCode(
      insertAction(ctx, {
        marketId: duplicateId,
        userId,
        type: "manual_override",
        resultingStatus: "gruen",
        payload: { target_status: "gruen", reason: "Test" },
      }),
      "P0003",
    );
  });
});

// =============================================================================
// P0004 — Markt inaktiv
// =============================================================================
describe("Trigger — P0004 (Markt inaktiv)", () => {
  it("normale Action auf grauen Markt → P0004", async () => {
    const { marketId, userId } = await fixture();
    await ctx.pool.query("UPDATE market SET active = FALSE WHERE id = $1", [marketId]);
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "visit",
        result: "success",
        resultingStatus: "gelb",
      }),
      "P0004",
    );
  });

  it("manual_override auf grauen Markt → erlaubt", async () => {
    const { marketId, userId } = await fixture();
    await ctx.pool.query("UPDATE market SET active = FALSE WHERE id = $1", [marketId]);
    await insertAction(ctx, {
      marketId,
      userId,
      type: "manual_override",
      resultingStatus: "gruen",
      payload: { target_status: "gruen", reason: "Reaktivieren" },
    });
  });
});

// =============================================================================
// P0005 — Grün-Verstoß
// =============================================================================
describe("Trigger — P0005 (Grün-Verstoß)", () => {
  it("profi_visit auf grün → P0005", async () => {
    const { marketId, userId } = await fixture();
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "profi_visit",
        result: "success",
        resultingStatus: "gelb",
      }),
      "P0005",
    );
  });

  it("delivery auf grün → P0005", async () => {
    const { marketId, userId } = await fixture();
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "delivery",
        resultingStatus: "orange",
      }),
      "P0005",
    );
  });

  it("control auf grün → P0005", async () => {
    const { marketId, userId } = await fixture();
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "control",
        result: "ok",
        resultingStatus: "rot",
      }),
      "P0005",
    );
  });

  it("cancel_order auf grün → P0005", async () => {
    const { marketId, userId } = await fixture();
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "cancel_order",
        resultingStatus: "gruen",
        payload: { reason: "Test" },
      }),
      "P0005",
    );
  });

  it("profi_visit auf rot-mit-abgelaufenem-Cooldown → P0005", async () => {
    const { marketId, userId } = await fixture();
    await insertAction(ctx, {
      marketId,
      userId,
      type: "visit",
      result: "no_contact",
      resultingStatus: "rot",
      cooldownUntil: new Date(Date.now() - 60_000),
    });
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "profi_visit",
        result: "success",
        resultingStatus: "gelb",
      }),
      "P0005",
    );
  });
});

// =============================================================================
// P0006 — User inaktiv
// =============================================================================
describe("Trigger — P0006 (User inaktiv)", () => {
  it("Action durch inaktiven User → P0006", async () => {
    const { marketId, userId } = await fixture();
    await ctx.pool.query(`UPDATE "user" SET active = FALSE WHERE id = $1`, [userId]);
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "visit",
        result: "success",
        resultingStatus: "gelb",
      }),
      "P0006",
    );
  });

  it("manual_override durch inaktiven User → P0006 (User-Check vor manual_override-Bypass)", async () => {
    const { marketId, userId } = await fixture();
    await ctx.pool.query(`UPDATE "user" SET active = FALSE WHERE id = $1`, [userId]);
    await expectPgCode(
      insertAction(ctx, {
        marketId,
        userId,
        type: "manual_override",
        resultingStatus: "gruen",
        payload: { target_status: "gruen", reason: "Test" },
      }),
      "P0006",
    );
  });
});

// =============================================================================
// Concurrency-Schutz (Advisory Lock)
// =============================================================================
describe("Trigger — Concurrency-Schutz", () => {
  it("Zwei parallele Inserts auf denselben Markt: einer geht durch, einer P0001", async () => {
    const { marketId, userId } = await fixture();

    const c1 = await ctx.pool.connect();
    const c2 = await ctx.pool.connect();

    try {
      await c1.query("BEGIN");
      await c1.query("SELECT pg_advisory_xact_lock(hashtext($1))", [marketId]);
      await c2.query("BEGIN");

      const secondInsert = c2.query(
        `INSERT INTO action (market_id, user_id, type, result, resulting_status)
         VALUES ($1, $2, 'visit', 'success', 'gelb') RETURNING id`,
        [marketId, userId],
      );

      const firstInsert = await c1.query(
        `INSERT INTO action (market_id, user_id, type, result, resulting_status)
         VALUES ($1, $2, 'visit', 'success', 'gelb') RETURNING id`,
        [marketId, userId],
      );
      await c1.query("COMMIT");
      expect(firstInsert.rowCount).toBe(1);

      const secondResult = await secondInsert.then(
        () => ({ status: "fulfilled" as const }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );
      expect(secondResult.status).toBe("rejected");
      if (secondResult.status !== "rejected") {
        await c2.query("COMMIT");
        throw new Error("expected the blocked insert to fail with P0001");
      }
      await c2.query("ROLLBACK");
      expect(isPostgresError(secondResult.error)).toBe(true);
      if (!isPostgresError(secondResult.error)) throw secondResult.error;
      expect(secondResult.error.code).toBe("P0001");
    } finally {
      c1.release();
      c2.release();
    }
  });
});
