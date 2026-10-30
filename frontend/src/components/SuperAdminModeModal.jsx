export const SuperAdminModeModal = ({
  isOpen,
  pendingFile,
  selectedMode,
  setSelectedMode,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen || !pendingFile) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden animate-fade-in">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-900">Select Ingestion Mode</h3>
            <p className="text-xs text-slate-500 truncate">File: {pendingFile.name}</p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-600">
            Select the underwriter condition rules to apply for validating this package:
          </p>

          <label
            onClick={() => setSelectedMode('pre-underwrite')}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              selectedMode === 'pre-underwrite'
                ? 'border-[#24A1DD] bg-[#24A1DD]/5'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <input
              type="radio"
              name="superAdminMode"
              value="pre-underwrite"
              checked={selectedMode === 'pre-underwrite'}
              onChange={() => setSelectedMode('pre-underwrite')}
              className="mt-0.5 text-[#24A1DD] focus:ring-[#24A1DD]"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">Pre-Underwriter Mode</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  Pre-UW
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Validates against Pre-Underwriter conditions and business guidelines.
              </p>
            </div>
          </label>

          <label
            onClick={() => setSelectedMode('junior-underwrite')}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              selectedMode === 'junior-underwrite'
                ? 'border-[#24A1DD] bg-[#24A1DD]/5'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <input
              type="radio"
              name="superAdminMode"
              value="junior-underwrite"
              checked={selectedMode === 'junior-underwrite'}
              onChange={() => setSelectedMode('junior-underwrite')}
              className="mt-0.5 text-[#24A1DD] focus:ring-[#24A1DD]"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">Junior-Underwriter Mode</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  Junior-UW
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Validates against Junior-Underwriter conditions and business guidelines.
              </p>
            </div>
          </label>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 border border-slate-300 hover:bg-white text-slate-700 font-medium rounded-lg text-xs transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 bg-[#24A1DD] hover:bg-[#1e88bb] text-white font-medium rounded-lg text-xs shadow-2xs transition-all cursor-pointer"
          >
            Continue with Ingestion
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminModeModal;
