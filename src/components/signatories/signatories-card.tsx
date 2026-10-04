"use client";

/**
 * Your firm's "Signing" section: the firm's list of signatories (0343, Q005).
 *
 * The client asked for "option to add signatories and then the drop down at
 * the time of finalizing EL to select who will sign that particular EL". This
 * is the first half; the letter's "Signed by" select is the second
 * (`SignedBySelect`).
 *
 * Its own file so the page it sits on (also edited by the company calendar
 * work) changes in three lines. The page owns loading, errors and the notice;
 * this owns the table, the add form and the change form, and reports each
 * write through the page's `act`.
 *
 * WHAT IS TRUE OF THE LIST, all of it enforced by the API:
 * - firm-wide, whichever company issues the letter;
 * - one entry per person, staff with active access only;
 * - the firm's FIRST signatory is its default; the default cannot be retired;
 * - the signature image is the PERSON's. Without one, the default still prints
 *   each company's signature (what every letter did before 0343), and anyone
 *   else prints a bare line: never somebody else's signature over their name.
 */
import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "@/lib/api/client";
import type { Signatory } from "@/lib/api/client";
import {
  Button,
  Card,
  CardHead,
  Checkbox,
  Dialog,
  Field,
  FieldStack,
  Input,
  Menu,
  MenuItem,
  NotSet,
  Pill,
  Select,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";

export interface SignatoryColleague {
  readonly userId: string;
  readonly displayName: string | null;
  readonly email: string;
}

/** The page's write wrapper: runs the call, shows its refusal or the notice,
 *  and reloads. True when it went through. */
export type Act = (key: string, call: () => Promise<{ error?: unknown }>, done: string) => Promise<boolean>;

/** What the renderer can draw on a letter (the API refuses anything else). */
const SIGNATURE_ACCEPT = "image/png,image/jpeg";

export function SignatoriesCard({
  signatories,
  colleagues,
  busy,
  act,
}: {
  signatories: readonly Signatory[];
  colleagues: readonly SignatoryColleague[];
  /** The page's busy key, so a row's button can show it is working. */
  busy: string | null;
  act: Act;
}) {
  const [adding, setAdding] = useState(false);
  const [changing, setChanging] = useState<Signatory | null>(null);
  const listed = new Set(signatories.map((s) => s.userId));
  const addable = colleagues.filter((c) => !listed.has(c.userId));
  const nameOf = (s: Signatory): string =>
    s.displayName ?? colleagues.find((c) => c.userId === s.userId)?.email ?? "Unnamed";

  return (
    <Card id="signing">
      <CardHead
        level={2}
        title="Signing"
        aside={
          signatories.length > 0 && addable.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              Add a signatory
            </Button>
          ) : undefined
        }
      />

      {signatories.length === 0 ? (
        <AddForm
          colleagues={addable}
          first
          busy={busy === "signatory:add"}
          onAdd={(userId, title, makeDefault) =>
            act(
              "signatory:add",
              () =>
                api.POST("/api/v1/tenancy/signatories", {
                  body: { userId, title, makeDefault },
                }),
              "Signatory added. New letters carry this name.",
            )
          }
        />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Signs as</Th>
                <Th>Signature</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {signatories.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <strong>{nameOf(s)}</strong> {s.isDefault && <Pill tone="ok">Default</Pill>}
                    {!s.isActive && <Pill tone="quiet">Retired</Pill>}
                  </Td>
                  <Td>{s.title}</Td>
                  <Td>
                    {s.signatureVersionId !== null ? (
                      "Uploaded"
                    ) : s.isDefault ? (
                      <Sub>Uses each company&apos;s signature</Sub>
                    ) : (
                      <NotSet />
                    )}
                  </Td>
                  <Td align="right">
                    <div className="cluster" style={{ justifyContent: "flex-end" }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Change ${nameOf(s)}`}
                        onClick={() => setChanging(s)}
                      >
                        Change
                      </Button>
                      {!(s.isDefault && s.isActive) && (
                        <Menu
                          trigger={
                            <span
                              className="btn"
                              data-variant="ghost"
                              data-size="sm"
                              aria-label={`More for ${nameOf(s)}`}
                            >
                              More
                            </span>
                          }
                        >
                          {s.isActive && !s.isDefault && (
                            <MenuItem
                              onClick={() =>
                                void act(
                                  "signatory:default",
                                  () =>
                                    api.POST("/api/v1/tenancy/signatories/{signatoryId}/default", {
                                      params: { path: { signatoryId: s.id } },
                                    }),
                                  `${nameOf(s)} now signs letters nobody chose a signatory for.`,
                                )
                              }
                            >
                              Make default
                            </MenuItem>
                          )}
                          <MenuItem
                            onClick={() =>
                              void act(
                                "signatory:active",
                                () =>
                                  api.PUT("/api/v1/tenancy/signatories/{signatoryId}/active", {
                                    params: { path: { signatoryId: s.id } },
                                    body: { isActive: !s.isActive },
                                  }),
                                s.isActive
                                  ? `${nameOf(s)} is retired. Letters already sent keep their name.`
                                  : `${nameOf(s)} can sign letters again.`,
                              )
                            }
                          >
                            {s.isActive ? "Retire" : "Reinstate"}
                          </MenuItem>
                        </Menu>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {adding && (
        <Dialog open onClose={() => setAdding(false)} title="Add a signatory">
          <AddForm
            colleagues={addable}
            first={false}
            busy={busy === "signatory:add"}
            onCancel={() => setAdding(false)}
            onAdd={async (userId, title, makeDefault) => {
              const ok = await act(
                "signatory:add",
                () =>
                  api.POST("/api/v1/tenancy/signatories", {
                    body: { userId, title, makeDefault },
                  }),
                "Signatory added.",
              );
              if (ok) setAdding(false);
              return ok;
            }}
          />
        </Dialog>
      )}

      {changing !== null && (
        <ChangeDialog
          key={changing.id}
          signatory={changing}
          name={nameOf(changing)}
          busy={busy === "signatory:change"}
          onClose={() => setChanging(null)}
          act={act}
        />
      )}
    </Card>
  );
}

function AddForm({
  colleagues,
  first,
  busy,
  onAdd,
  onCancel,
}: {
  colleagues: readonly SignatoryColleague[];
  /** The firm's first: it becomes the default whatever is ticked. */
  first: boolean;
  busy: boolean;
  onAdd: (userId: string, title: string, makeDefault: boolean) => Promise<boolean>;
  onCancel?: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onAdd(
      String(form.get("userId") ?? ""),
      String(form.get("title") ?? "").trim(),
      first || form.get("makeDefault") === "on",
    );
  }
  return (
    <form onSubmit={submit}>
      <FieldStack>
        <Field label="Who" hint={first ? "Letters go out unsigned until someone is named." : undefined}>
          <Select name="userId" required defaultValue="">
            <option value="" disabled>
              Choose a colleague
            </option>
            {colleagues.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.displayName ?? c.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Signs as" hint="Printed under the signature.">
          <Input name="title" required maxLength={120} placeholder="e.g. Managing Partner" />
        </Field>
        {!first && <Checkbox name="makeDefault" label="Make them the default" />}
        <div className="cluster">
          <Button type="submit" variant={first ? "secondary" : "primary"} loading={busy}>
            {first ? "Save" : "Add"}
          </Button>
          {onCancel !== undefined && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </FieldStack>
    </form>
  );
}

/**
 * What they sign as, and their own signature image.
 *
 * The image is two calls, the brand screen's order: the bytes become an
 * ordinary document, then that version is put on the signatory. A failure on
 * the second leaves the file stored and says so.
 */
function ChangeDialog({
  signatory,
  name,
  busy,
  onClose,
  act,
}: {
  signatory: Signatory;
  name: string;
  busy: boolean;
  onClose: () => void;
  act: Act;
}) {
  const formId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [unchanged, setUnchanged] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const file = fileInput.current?.files?.[0];
    const remove = form.get("removeSignature") === "on";
    const titleChanged = title !== signatory.title;
    if (!titleChanged && file === undefined && !remove) {
      setUnchanged(true);
      return;
    }
    void (async () => {
      const ok = await act(
        "signatory:change",
        async () => {
          let signatureVersionId: string | null | undefined;
          if (file !== undefined) {
            const payload = new FormData();
            payload.set("file", file);
            payload.set("title", `${name} signature`);
            payload.set("kind", "brand_asset");
            const stored = await api.POST("/api/v1/documents", {
              body: payload as unknown as never,
              bodySerializer: (b: unknown) => b as FormData,
            });
            if (stored.error) return stored;
            signatureVersionId = stored.data.latestVersion.id;
          } else if (remove) {
            signatureVersionId = null;
          }
          return api.PATCH("/api/v1/tenancy/signatories/{signatoryId}", {
            params: { path: { signatoryId: signatory.id } },
            body: {
              ...(titleChanged ? { title } : {}),
              ...(signatureVersionId === undefined ? {} : { signatureVersionId }),
            },
          });
        },
        `${name} is saved. Letters already sent keep what they went out with.`,
      );
      if (ok) onClose();
    })();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Change ${name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} onChange={() => setUnchanged(false)}>
        <FieldStack>
          <Field label="Signs as" hint="Printed under the signature.">
            <Input name="title" required maxLength={120} defaultValue={signatory.title} />
          </Field>
          <Field
            label={signatory.signatureVersionId === null ? "Signature image" : "Replace signature image"}
            hint="PNG or JPEG. Printed above their name."
          >
            <input ref={fileInput} type="file" name="signature" accept={SIGNATURE_ACCEPT} />
          </Field>
          {signatory.signatureVersionId !== null && (
            <Checkbox name="removeSignature" label="Remove their signature image" />
          )}
          {unchanged && <p className="muted">Nothing has changed.</p>}
        </FieldStack>
      </form>
    </Dialog>
  );
}
