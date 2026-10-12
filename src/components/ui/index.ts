/**
 * The design system's front door.
 *
 * `import { Button, Card, Field, Input } from "@/components/ui"` — one path,
 * so "what is there?" is answered by autocomplete rather than by reading the
 * directory. If a component is not exported here, it is not part of the system
 * yet.
 */
export { cx } from "./class-names";

export {
  Button,
  LinkButton,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./button";
export { Card, CardHead, CardTitle, CardFoot } from "./card";
export { Dialog } from "./dialog";
export {
  Field,
  FieldRow,
  FieldStack,
  Fieldset,
  Label,
  Input,
  Select,
  Textarea,
  Checkbox,
  Radio,
  Switch,
  type FieldProps,
  type InputProps,
  type SelectProps,
  type TextareaProps,
  useFieldWiring,
} from "./field";
export { AmountInput, isTypedAmount, type AmountInputProps } from "./amount-input";
export { Icon, type IconName } from "./icon";
export { Menu, MenuItem, MenuSeparator } from "./menu";
export { Meta, MetaItem, NotSet, NotStated, Prose, ProseGrid } from "./meta";
export { Notice, ErrorNotice, type NoticeTone } from "./notice";
export { Pill, type PillTone } from "./pill";
export { Skeleton, SkeletonText } from "./skeleton";
export { Spinner } from "./spinner";
export { useSwapFocus } from "./swap-focus";
export { useAppearFocus } from "./appear-focus";
export { scrollBelowBar } from "./below-bar";
export { Stat, Strip } from "./stat";
export { CountUp, type Figure } from "./count-up";

// THE CHART KIT IS NOT RE-EXPORTED HERE, deliberately (Wave 5). This barrel is
// not tree-shaken (the package declares no `sideEffects`), so everything in it
// ships on every screen that imports anything from it. Re-exported here, the
// charts added about 4 KB gzip to /work-items, which draws none (measured with
// `next build`). A screen that draws a chart imports that chart's own file:
// `@/components/ui/chart/bar-chart`, `.../area-chart`, and `axisMoney` from
// `.../scale`.
export {
  Table,
  TableWrap,
  Th,
  Td,
  Tr,
  RowLink,
  RowChevron,
  ThChevron,
  Sub,
  EmptyRow,
  type CellAlign,
} from "./table";
export { Tabs, TabPanel, type TabItem } from "./tabs";
export { Tooltip } from "./tooltip";
