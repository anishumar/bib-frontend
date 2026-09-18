"use client";

import {
  createContext,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./class-names";

/**
 * A form control, and the label, hint and error that belong to it.
 *
 * This exists so that ACCESSIBILITY IS NOT A THING ANYONE HAS TO REMEMBER.
 * Wiring a label to its input, pointing `aria-describedby` at the hint, adding
 * `aria-invalid` when there is an error and making the error announce itself
 * is five attributes and a generated id, and every one of them was missing
 * from every form in this app. Writing them per field is how they get missed;
 * writing them once, here, is how they stop being optional.
 *
 * The control reads its own wiring out of context rather than being cloned, so
 * it keeps working when it sits inside a wrapper — a currency prefix, an
 * input with a button beside it — instead of only as a direct child.
 */

interface FieldWiring {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

const FieldContext = createContext<FieldWiring | null>(null);

/** What a control needs from its field. Empty when it is standalone. */
function useFieldWiring(): Partial<FieldWiring> {
  return useContext(FieldContext) ?? {};
}

export interface FieldProps {
  label: ReactNode;
  /** Guidance shown before anything goes wrong. */
  hint?: ReactNode;
  /**
   * What the API said, verbatim.
   *
   * A string, not a boolean: this product shows the message the backend sent,
   * because several of them are deliberately vague — the API must not confirm
   * who holds an account — and a friendlier local rewrite would leak exactly
   * what it refused to.
   */
  error?: string | null;
  /** Marks the label. Only ever says "optional"; a required field is the
   *  norm and an asterisk on everything else says nothing. */
  optional?: boolean;
  children: ReactNode;
  className?: string;
  /** Set only when a caller needs to point at this control from elsewhere. */
  id?: string;
}

export function Field({
  label,
  hint,
  error,
  optional = false,
  children,
  className,
  id,
}: FieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = hint === undefined ? undefined : `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const invalid = error !== undefined && error !== null && error !== "";

  // The error comes FIRST in the description order: when a field is announced,
  // what is wrong with it matters more than what it wanted.
  const describedBy =
    [invalid ? errorId : undefined, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id: fieldId, describedBy, invalid }}>
      <div className={cx("field", className)}>
        <label className="label" htmlFor={fieldId}>
          {label}
          {optional && <span className="optional"> (optional)</span>}
        </label>
        {children}
        {hint !== undefined && (
          <p className="field-hint" id={hintId}>
            {hint}
          </p>
        )}
        {invalid && (
          /* `role="alert"` so it is announced when it appears — a message that
             arrives after a failed submit is exactly the case a screen-reader
             user cannot see happen. */
          <p className="field-error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

/**
 * A label with no field around it — a checkbox's own label, a heading over a
 * group. Prefer `<Field>`; this is for the cases it does not fit.
 */
export function Label({
  children,
  htmlFor,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label className={cx("label", className)} htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export type ControlSize = "sm" | "md";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "size"> {
  size?: ControlSize;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ size = "md", className, ...rest }: InputProps) {
  const field = useFieldWiring();
  return (
    <input
      id={field.id}
      aria-describedby={field.describedBy}
      {...(field.invalid ? { "aria-invalid": true } : {})}
      {...rest}
      className={cx("input", className)}
      data-size={size}
    />
  );
}

export interface SelectProps
  /* `size` is omitted and redefined: on a native `<select>` it is the number of
     visible rows, which is not a thing this system offers and would otherwise
     collide with the control-height scale every other control uses. */
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "size"> {
  size?: ControlSize;
  className?: string;
  ref?: Ref<HTMLSelectElement>;
}

export function Select({ size = "md", className, ...rest }: SelectProps) {
  const field = useFieldWiring();
  return (
    <select
      id={field.id}
      aria-describedby={field.describedBy}
      {...(field.invalid ? { "aria-invalid": true } : {})}
      {...rest}
      className={cx("select", className)}
      data-size={size}
    />
  );
}

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, ...rest }: TextareaProps) {
  const field = useFieldWiring();
  return (
    <textarea
      id={field.id}
      aria-describedby={field.describedBy}
      {...(field.invalid ? { "aria-invalid": true } : {})}
      {...rest}
      className={cx("textarea", className)}
    />
  );
}

/**
 * A checkbox, and a label that may be a whole sentence.
 *
 * The label is the CONTROL's, not a sibling — the whole row is the target,
 * which matters as much for a mouse as for a screen reader. `note` is the
 * quiet half: "separate from their role, on purpose" belongs beside the
 * choice, not in a help link away from it.
 */
export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> {
  label: ReactNode;
  note?: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * `note` is a DESCRIPTION and never part of the name.
 *
 * Wrapped in a `<label>`, an input is named by everything the label contains,
 * so a `note` inside it was being appended to the control's accessible name:
 * on /admin/roles several run to five sentences, and every one of them was
 * read back in full on every focus, and again on every arrow key through a
 * radio group. `aria-labelledby` narrows the name to the label itself and the
 * note moves to `aria-describedby`, where a description is announced once,
 * after the name, and can be skipped.
 *
 * The `<label>` still WRAPS the control, so the whole row stays a click target
 * — that is what a label is for, and none of it changes on screen. Nothing is
 * added at all when there is no note: the native naming is right then.
 *
 * A caller's own `aria-describedby` is kept and the note is appended to it
 * (/admin/workflows points a checkbox at a hint describing the whole group),
 * because replacing it would silently drop the group's explanation.
 */
export function Checkbox({
  label,
  note,
  className,
  "aria-describedby": describedBy,
  ...rest
}: CheckboxProps) {
  const generated = useId();
  const labelId = `${generated}-label`;
  const noteId = `${generated}-note`;
  const described = [describedBy, note === undefined ? undefined : noteId]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={cx("check", className)}>
      <input
        type="checkbox"
        {...(note === undefined ? {} : { "aria-labelledby": labelId })}
        {...(described === "" ? {} : { "aria-describedby": described })}
        {...rest}
      />
      <span>
        {note === undefined ? label : <span id={labelId}>{label}</span>}
        {note !== undefined && (
          <span className="note">
            {" · "}
            <span id={noteId}>{note}</span>
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * One option of a radio group.
 *
 * `note` carries the trade-off, on the option itself. This is the control that
 * decides who may sign off a statutory filing, and "the reporting line stalls
 * when that person is on leave" has to be readable at the moment somebody
 * picks it — not in a tooltip they will never open.
 */
export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> {
  label: ReactNode;
  note?: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/** See `Checkbox` above for why the note is not part of the name. */
export function Radio({
  label,
  note,
  className,
  "aria-describedby": describedBy,
  ...rest
}: RadioProps) {
  const generated = useId();
  const labelId = `${generated}-label`;
  const noteId = `${generated}-note`;
  const described = [describedBy, note === undefined ? undefined : noteId]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={cx("check", className)} data-row="true">
      <input
        type="radio"
        {...(note === undefined ? {} : { "aria-labelledby": labelId })}
        {...(described === "" ? {} : { "aria-describedby": described })}
        {...rest}
      />
      <span>
        {note === undefined ? label : <span id={labelId}>{label}</span>}
        {note !== undefined && (
          <>
            <br />
            <span className="note" id={noteId}>
              {note}
            </span>
          </>
        )}
      </span>
    </label>
  );
}

/**
 * A switch.
 *
 * A real `<input type="checkbox">` under the track, sized to cover it. That is
 * what keeps every behaviour a checkbox already has — Space toggles it, a
 * screen reader calls it a checkbox and says whether it is checked, a form
 * submits it — none of which a `<div role="switch">` gets without a hundred
 * lines that will be almost right.
 *
 * Use it for something that takes effect AT ONCE. A setting that needs saving
 * is a checkbox with a Save beside it; a switch that needs confirming is
 * lying about what it did.
 */
export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> {
  label: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Switch({ label, className, ...rest }: SwitchProps) {
  return (
    <label className={cx("switch", className)}>
      <input type="checkbox" role="switch" {...rest} />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

/**
 * A group of related controls under one heading.
 *
 * `<fieldset>`/`<legend>` rather than a heading and a div, because a radio
 * group's question has to be announced with each option — otherwise every
 * option is read as an answer to nothing.
 */
export function Fieldset({
  legend,
  children,
  className,
}: {
  legend: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cx("fieldset", className)}>
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}

/** Fields down a form, at one gap. */
export function FieldStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("field-stack", className)}>{children}</div>;
}

/** Fields across a row, wrapping on their own rather than at a breakpoint. */
export function FieldRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("field-row", className)}>{children}</div>;
}
