"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney, readServiceBody } from "@/lib/api/client";
import type { ConfigEntry } from "@/lib/api/client";

/**
 * What the firm sells, and the one rule it sells under.
 *
 * This is the configuration registry with its commercial hat on — the same
 * machinery as `/admin/roles`, a different kind. Two things about it decide how
 * this screen behaves and neither is presentation:
 *
 * PUBLISHING FREEZES. A published version's body can never change; an edit is a
 * NEW version, and the one it replaces is archived and stays readable forever.
 * That is what makes a proposal's pin meaningful — a quote sent in March still
 * resolves March's price after the catalogue moved on. So this screen offers
 * "new version", never "edit".
 *
 * READING IS BROAD, WRITING IS `tenant:admin`. An associate quotes from the
 * catalogue, so the list is theirs to see; changing what the firm sells is not.
 * The controls are offered on that basis and the API refuses regardless.
 */
export default function CataloguePage() {
  const router = useRouter();
  const [services, setServices] = useState<ConfigEntry[]>([]);
  const [policies, setPolicies] = useState<ConfigEntry[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const [catalogue, policy, me] = await Promise.all([
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "policy" } } }),
      api.GET("/api/v1/auth/me", {}),
    ]);
    if (catalogue.response.status === 401) {
      router.push("/login");
      return;
    }
    if (catalogue.error) {
      setError(apiError(catalogue.error).message);
      setLoaded(true);
      return;
    }
    setServices(catalogue.data.entries);
    setPolicies(policy.data?.entries ?? []);
    setPermissions(me.data?.permissions ?? []);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(key);
    setError(null);
    const result = await call();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    await load();
    setBusy(null);
  }

  /** A service body, from the form. A list price is OPTIONAL: an hourly or
   *  retainer service often has none until an engagement is scoped, and the API
   *  reads null as "we quote it", never as zero. */
  function serviceBody(form: FormData): Record<string, unknown> {
    const amount = String(form.get("amount") ?? "").trim();
    const currency = String(form.get("currency") ?? "").trim().toUpperCase();
    return {
      name: String(form.get("name")).trim(),
      billingBasis: String(form.get("billingBasis")),
      listPrice: amount === "" ? null : { amount, currency },
    };
  }

  function define(form: FormData): void {
    void act("define", () =>
      api.POST("/api/v1/config/{kind}", {
        params: { path: { kind: "service" } },
        body: { key: String(form.get("key")).trim(), body: serviceBody(form) },
      }),
    );
  }

  function newVersion(key: string, form: FormData): void {
    void act(key, () =>
      api.POST("/api/v1/config/{kind}/{key}/versions", {
        params: { path: { kind: "service", key } },
        body: { body: serviceBody(form) },
      }),
    );
  }

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  const canWrite = permissions.includes("tenant:admin");
  const discount = policies.find((p) => p.entry.key === "discount");
  const discountLimit =
    discount?.published === null || discount === undefined
      ? null
      : String(discount.published.body["maxDiscountPercent"] ?? "");

  return (
    <main>
      <nav className="bib-nav">
        <Link href="/">← Workspace</Link>
        <Link href="/proposals">Proposals</Link>
      </nav>
      <h1>Catalogue</h1>
      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        {services.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            Nothing in the catalogue yet.
          </p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Charged</th>
                <th style={{ textAlign: "right" }}>List price</th>
                <th>In force</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {services.map((entry) => {
                const body = readServiceBody(entry.published?.body);
                const basis = entry.published?.body["billingBasis"];
                return (
                  <tr key={entry.entry.id}>
                    <td>
                      <div>{body.name || entry.entry.key}</div>
                      <div className="bib-muted bib-mono">{entry.entry.key}</div>
                    </td>
                    <td className="bib-muted">
                      {typeof basis === "string" ? basis.replace("_", " ") : "—"}
                    </td>
                    <td style={{ textAlign: "right" }} className="bib-mono">
                      {/* Null is "we quote it", not free — so a dash, never a zero. */}
                      {body.listPrice === null
                        ? "—"
                        : formatMoney(body.listPrice.amount, body.listPrice.currency)}
                    </td>
                    <td>
                      {entry.published === null ? (
                        // A draft was never in force, so it cannot be quoted —
                        // the proposal screen will not offer it either.
                        <span className="bib-pill" data-tone="revoked">
                          draft only
                        </span>
                      ) : (
                        <span className="bib-muted bib-mono">v{entry.published.version}</span>
                      )}
                    </td>
                    {canWrite && (
                      <td style={{ textAlign: "right" }}>
                        {entry.published === null && (
                          <button
                            className="bib-button-quiet"
                            disabled={busy !== null}
                            onClick={() => {
                              void act(entry.entry.key, () =>
                                api.POST(
                                  "/api/v1/config/{kind}/{key}/versions/{version}/publish",
                                  {
                                    params: {
                                      path: { kind: "service", key: entry.entry.key, version: 1 },
                                    },
                                  },
                                ),
                              );
                            }}
                          >
                            Publish v1
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Discount limit</h2>
        <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
          {discountLimit === null || discountLimit === ""
            ? "None published — so ANY discount needs sign-off from somebody holding proposal:approve. A firm that has never set a limit has not decided that anything goes."
            : `${discountLimit}% off without sign-off. Past it, a proposal cannot be sent until somebody holding proposal:approve has approved it.`}
        </p>
        {canWrite && (
          <form
            action={(form) => {
              const max = String(form.get("maxDiscountPercent")).trim();
              // Defined once, then a new version each time — publishing freezes,
              // so a limit is never edited in place.
              void act("policy", () =>
                discount === undefined
                  ? api.POST("/api/v1/config/{kind}", {
                      params: { path: { kind: "policy" } },
                      body: { key: "discount", body: { maxDiscountPercent: max } },
                    })
                  : api.POST("/api/v1/config/{kind}/{key}/versions", {
                      params: { path: { kind: "policy", key: "discount" } },
                      body: { body: { maxDiscountPercent: max } },
                    }),
              );
            }}
          >
            <div className="bib-field-row">
              <div style={{ flex: "0 1 140px" }}>
                <label className="bib-label" htmlFor="maxDiscountPercent">
                  Limit %
                </label>
                <input
                  className="bib-input"
                  id="maxDiscountPercent"
                  name="maxDiscountPercent"
                  defaultValue={discountLimit ?? "15"}
                  required
                />
              </div>
              <div>
                <button className="bib-button" type="submit" disabled={busy !== null}>
                  {discount === undefined ? "Set it" : "Draft a new limit"}
                </button>
              </div>
            </div>
            {discount !== undefined && (
              <p className="bib-muted" style={{ fontSize: 13, marginBottom: 0 }}>
                A new version is a draft until it is published — the limit in force does not
                move until then.
              </p>
            )}
          </form>
        )}
      </div>

      {canWrite && (
        <div className="bib-card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Add a service</h2>
          <form
            action={(form) => {
              define(form);
            }}
          >
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div style={{ flex: "2 1 200px" }}>
                <label className="bib-label" htmlFor="name">
                  Name
                </label>
                <input className="bib-input" id="name" name="name" required />
              </div>
              <div>
                <label className="bib-label" htmlFor="key">
                  Handle
                </label>
                {/* The key is a HANDLE, not a title: pins and references are
                    written against it, so it never changes. The label above can. */}
                <input
                  className="bib-input"
                  id="key"
                  name="key"
                  placeholder="gst-filing"
                  required
                />
              </div>
              <div>
                <label className="bib-label" htmlFor="billingBasis">
                  Charged
                </label>
                <select
                  className="bib-select"
                  id="billingBasis"
                  name="billingBasis"
                  style={{ width: "100%" }}
                >
                  {["fixed", "hourly", "retainer", "per_unit"].map((b) => (
                    <option key={b} value={b}>
                      {b.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div>
                <label className="bib-label" htmlFor="amount">
                  List price (optional)
                </label>
                <input className="bib-input" id="amount" name="amount" placeholder="25000.00" />
              </div>
              <div>
                <label className="bib-label" htmlFor="currency">
                  Currency
                </label>
                <input
                  className="bib-input"
                  id="currency"
                  name="currency"
                  defaultValue="INR"
                  maxLength={3}
                />
              </div>
            </div>
            <button className="bib-button" type="submit" disabled={busy !== null}>
              Add as a draft
            </button>
            <p className="bib-muted" style={{ fontSize: 13, marginBottom: 0 }}>
              Defining does not put it in force. Publish it, and from then on the version it
              was quoted at is frozen — which is what lets a proposal reopened next year still
              show the price it was sent at.
            </p>
          </form>
        </div>
      )}
    </main>
  );
}
