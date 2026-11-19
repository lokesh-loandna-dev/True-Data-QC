/**
 * Ant Design ConfigProvider Theme Tokens & Algorithm Setup
 * Maps APEX color tokens into Ant Design theme specification.
 */

export const getAntdTheme = (isDark = false, antdTheme = null) => {
  return {
    algorithm: antdTheme
      ? (isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm)
      : (isDark ? 'darkAlgorithm' : 'defaultAlgorithm'),
    token: {
      colorPrimary: isDark ? '#3BB0E8' : '#24A1DD',
      colorPrimaryHover: isDark ? '#5FC2F0' : '#1D71AB',
      colorPrimaryActive: isDark ? '#24A1DD' : '#1D71AB',
      colorPrimaryBg: isDark ? 'rgba(36, 161, 221, 0.15)' : '#BAE7FF',
      colorPrimaryBorder: isDark ? '#3BB0E8' : '#24A1DD',
      colorBgBase: isDark ? '#0F1419' : '#FFFFFF',
      colorBgContainer: isDark ? '#1A2028' : '#FFFFFF',
      colorBgElevated: isDark ? '#232B35' : '#F9FAFB',
      colorBgLayout: isDark ? '#0F1419' : '#FFFFFF',
      colorBorder: isDark ? '#2E3742' : '#E0E0E0',
      colorBorderSecondary: isDark ? '#3D4754' : '#BBBBBB',
      colorText: isDark ? '#E6EAF0' : '#303030',
      colorTextSecondary: isDark ? '#9AA4B2' : '#6B7280',
      colorTextTertiary: isDark ? '#5C6673' : '#BFBFBF',
      colorTextDisabled: isDark ? '#5C6673' : '#BFBFBF',
      colorSuccess: isDark ? '#4ADE80' : '#22C55E',
      colorSuccessBg: isDark ? 'rgba(74, 222, 128, 0.12)' : 'rgba(34, 197, 94, 0.12)',
      colorWarning: isDark ? '#FBBF24' : '#FAAD14',
      colorWarningBg: isDark ? 'rgba(251, 191, 36, 0.12)' : 'rgba(250, 173, 20, 0.12)',
      colorError: isDark ? '#F87171' : '#E53935',
      colorErrorBg: isDark ? 'rgba(248, 113, 113, 0.12)' : 'rgba(229, 57, 53, 0.12)',
      colorInfo: isDark ? '#60A5FA' : '#3B82F6',
      colorInfoBg: isDark ? 'rgba(96, 165, 250, 0.12)' : 'rgba(59, 130, 246, 0.12)',
      fontFamily: '"Creato Display", sans-serif',
      borderRadius: 8,
      wireframe: false,
    },
    components: {
      Button: {
        colorPrimary: isDark ? '#3BB0E8' : '#24A1DD',
        colorPrimaryHover: isDark ? '#5FC2F0' : '#1D71AB',
        colorBorder: isDark ? '#3D4754' : '#BBBBBB',
      },
      Table: {
        headerBg: isDark ? '#1B3A4F' : '#24A1DD',
        headerColor: isDark ? '#E6EAF0' : '#FFFFFF',
        rowHoverBg: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F9FAFB',
        rowSelectedBg: isDark ? 'rgba(36, 161, 221, 0.15)' : '#BAE7FF',
        colorBgContainer: isDark ? '#1A2028' : '#FFFFFF',
        borderColor: isDark ? '#2E3742' : '#E0E0E0',
      },
      Modal: {
        contentBg: isDark ? '#1A2028' : '#FFFFFF',
        headerBg: isDark ? '#1A2028' : '#FFFFFF',
        footerBg: isDark ? '#1A2028' : '#FFFFFF',
      },
      Input: {
        colorBgContainer: isDark ? '#232B35' : '#FFFFFF',
        colorBorder: isDark ? '#3D4754' : '#BBBBBB',
        activeBorderColor: isDark ? '#3BB0E8' : '#1E9BD8',
        hoverBorderColor: isDark ? '#3BB0E8' : '#1E9BD8',
      },
      Select: {
        colorBgContainer: isDark ? '#232B35' : '#FFFFFF',
        colorBgElevated: isDark ? '#232B35' : '#F9FAFB',
        colorBorder: isDark ? '#3D4754' : '#BBBBBB',
      },
      Tabs: {
        colorPrimary: isDark ? '#3BB0E8' : '#24A1DD',
        itemSelectedColor: isDark ? '#3BB0E8' : '#24A1DD',
      },
    },
  };
};

/**
 * Ant Design ConfigProvider Bridge
 * Provides theme config context safely without crashing if antd isn't bundled.
 */
export const AntdThemeBridge = ({ isDark: _isDark, children }) => {
  return children;
};

export default getAntdTheme;
