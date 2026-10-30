export const ApiIngestionCard = ({
  apiLoanId,
  setApiLoanId,
  apiSellerName,
  setApiSellerName,
  apiMode,
  setApiMode,
  isSuperAdmin,
  apiLoading,
  loading,
  apiError,
  setApiError,
  onSubmit,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 mb-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            API Ingestion
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Fetch True Data directly via external API and perform validation.
          </p>
        </div>
      </div>

      {apiError && (
        <div className="mb-6 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3">
          <svg className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 font-medium">{apiError}</div>
          <button
            type="button"
            onClick={() => setApiError('')}
            className="text-rose-500 hover:text-rose-700 cursor-pointer"
            aria-label="Dismiss API error"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Loan ID Input */}
          <div className="space-y-1.5">
            <label htmlFor="api-loan-id" className="block text-xs font-semibold text-slate-700">
              Loan ID <span className="text-rose-500">*</span>
            </label>
            <input
              id="api-loan-id"
              type="text"
              value={apiLoanId}
              placeholder="e.g. 45678101"
              onChange={(e) => {
                setApiLoanId(e.target.value);
                if (apiError) setApiError('');
              }}
              disabled={apiLoading}
              className="w-full h-10 px-3.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#24A1DD] focus:border-[#24A1DD] shadow-2xs font-mono transition-all disabled:opacity-50"
            />
          </div>

          {/* Seller Name Input */}
          <div className="space-y-1.5">
            <label htmlFor="api-seller-name" className="block text-xs font-semibold text-slate-700">
              Seller Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="api-seller-name"
              type="text"
              value={apiSellerName}
              placeholder="e.g. Test Seller 2"
              onChange={(e) => {
                setApiSellerName(e.target.value);
                if (apiError) setApiError('');
              }}
              disabled={apiLoading}
              className="w-full h-10 px-3.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#24A1DD] focus:border-[#24A1DD] shadow-2xs transition-all disabled:opacity-50"
            />
          </div>
        </div>

        {/* Super Admin Mode Selector */}
        {isSuperAdmin && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <span className="block text-xs font-semibold text-slate-700">
              Ingestion Mode (Super Admin):
            </span>
            <div className="flex flex-wrap gap-5 pt-0.5">
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="radio"
                  name="apiSuperAdminMode"
                  value="pre-underwrite"
                  checked={apiMode === 'pre-underwrite'}
                  onChange={() => setApiMode('pre-underwrite')}
                  className="text-[#24A1DD] focus:ring-[#24A1DD] cursor-pointer"
                />
                <span>Pre-Underwriter</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="radio"
                  name="apiSuperAdminMode"
                  value="junior-underwrite"
                  checked={apiMode === 'junior-underwrite'}
                  onChange={() => setApiMode('junior-underwrite')}
                  className="text-[#24A1DD] focus:ring-[#24A1DD] cursor-pointer"
                />
                <span>Junior-Underwriter</span>
              </label>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-4 flex justify-end border-t border-slate-100">
          <button
            type="submit"
            disabled={apiLoading || loading || !apiLoanId.trim() || !apiSellerName.trim()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#24A1DD] hover:bg-[#1e88bb] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold text-xs rounded-lg shadow-xs transition-all active:scale-[0.99] cursor-pointer"
          >
            {apiLoading ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Fetching & Validating...</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <span>Fetch & Validate Loan</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ApiIngestionCard;
