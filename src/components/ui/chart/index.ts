// The kit in one place, for reading. Screens import each chart's own FILE
// rather than this index, so a screen that draws only an area chart does not
// ship the bars too (see the note in `components/ui/index.ts`).
export { BarChart, type BarDatum } from "./bar-chart";
export { AreaChart, type AreaPoint } from "./area-chart";
export { axisMoney } from "./scale";
