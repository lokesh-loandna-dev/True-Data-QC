/**
 * Shared Chart Theme & Color Tokens for APEX Frontend
 * Category colors: teal #2DD4BF, blue #60A5FA, gold #FACC15, red #F87171, purple #C084FC
 * Grid lines: var(--border)
 * Axis labels: var(--text-secondary)
 * Tooltips: var(--bg-elevated)
 */

export const CHART_COLORS = {
  teal: '#2DD4BF',
  blue: '#60A5FA',
  gold: '#FACC15',
  red: '#F87171',
  purple: '#C084FC',
};

export const CHART_PALETTE = [
  '#2DD4BF', // teal
  '#60A5FA', // blue
  '#FACC15', // gold
  '#F87171', // red
  '#C084FC', // purple
];

export const getChartConfig = (isDark = false) => ({
  colors: CHART_PALETTE,
  grid: {
    stroke: isDark ? '#2E3742' : '#E0E0E0',
    borderColor: isDark ? '#2E3742' : '#E0E0E0',
  },
  axis: {
    stroke: isDark ? '#9AA4B2' : '#6B7280',
    tickColor: isDark ? '#9AA4B2' : '#6B7280',
    fontSize: 12,
  },
  tooltip: {
    backgroundColor: isDark ? '#232B35' : '#F9FAFB',
    borderColor: isDark ? '#3D4754' : '#E0E0E0',
    color: isDark ? '#E6EAF0' : '#303030',
  },
});

export default CHART_COLORS;
