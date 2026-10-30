export const ValidationSummaryCards = ({ summary = {}, condSummary = null }) => {
  const totalFields = summary["Total Fields"] ?? 0;
  const matched = summary["Matched"] ?? 0;
  const unmatched = summary["Unmatched"] ?? 0;
  const matchPct = totalFields > 0 ? (matched / totalFields) * 100 : 0;

  const typePass = summary["Type Pass"] ?? 0;
  const typeFail = summary["Type Fail"] ?? 0;
  const blankValues = summary["Blank Values"] ?? 0;
  const typeTotal = typePass + typeFail + blankValues;

  const totalEnum = summary["Total Enum"] ?? 0;
  const enumPass = summary["Enum Pass"] ?? 0;
  const enumVariance = summary["Enum Format Variance"] ?? 0;
  const enumFail = summary["Enum Fail"] ?? 0;
  const enumNoList = summary["Enum No List"] ?? 0;

  const totalMacro = summary["Total Macro"] ?? 0;
  const macroValid = summary["Macro Valid"] ?? 0;
  const macroInvalid = summary["Macro Invalid"] ?? 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* General Summary Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">General Statistics</h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
            <div className="text-3xl font-extrabold text-slate-900">{totalFields}</div>
            <div className="text-xs text-slate-500 mt-1 font-semibold">Total Fields</div>
          </div>
          <div className="bg-green-50/50 border border-green-100 rounded-2xl p-4 text-center">
            <div className="text-3xl font-extrabold text-green-700">{summary["Final Valid"] ?? 0}</div>
            <div className="text-xs text-green-600 mt-1 font-semibold">Final Valid</div>
          </div>
          <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4 text-center">
            <div className="text-3xl font-extrabold text-red-700">{summary["Final Invalid"] ?? 0}</div>
            <div className="text-xs text-red-600 mt-1 font-semibold">Final Invalid</div>
          </div>
          <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 text-center">
            <div className="text-3xl font-extrabold text-amber-700">{summary["Review Required"] ?? 0}</div>
            <div className="text-xs text-amber-600 mt-1 font-semibold">Review Required</div>
          </div>
        </div>
      </div>

      {/* Detailed Analysis Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Dictionary Matches */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2">
            Dictionary Match Checks ({totalFields} Total)
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 font-semibold">Matched Fields</span>
              <span className="font-bold text-green-600">{matched}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${matchPct}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-sm pt-2">
              <span className="text-slate-600 font-semibold">Unmatched Fields</span>
              <span className="font-bold text-red-600">{unmatched}</span>
            </div>
          </div>
        </div>

        {/* Data Type Checks */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2">
            Data Type Validation ({typeTotal} Total)
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 font-semibold">Type Check Pass</span>
              <span className="font-bold text-green-600">{typePass}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 font-semibold">Type Check Fail</span>
              <span className="font-bold text-red-600">{typeFail}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 font-semibold">Blank Values (N/A)</span>
              <span className="font-bold text-slate-500">{blankValues}</span>
            </div>
          </div>
        </div>

        {/* Enum Checks */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2">
            Enumeration Checks ({totalEnum} Total)
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 font-semibold">Enum Valid</span>
              <span className="font-bold text-green-600">{enumPass}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 font-semibold">Format Variance (Warnings)</span>
              <span className="font-bold text-amber-600">{enumVariance}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 font-semibold">Enum Fail</span>
              <span className="font-bold text-red-600">{enumFail}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 font-semibold">Enum No List</span>
              <span className="font-bold text-slate-500">{enumNoList}</span>
            </div>
          </div>
        </div>

        {/* Business Rules (Macro Rules) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2">
            Business Rule Modules ({totalMacro} Evaluated)
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 font-semibold">Macro Valid</span>
              <span className="font-bold text-green-600">{macroValid}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 font-semibold">Macro Fail (Invalid Date / Ranges)</span>
              <span className="font-bold text-red-600">{macroInvalid}</span>
            </div>
          </div>
        </div>

        {/* Condition Validation */}
        {condSummary && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4 md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-150 pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Condition Validation ({condSummary.condRulesApplied} Rules Applied)
              </h4>
              <span className="text-xs font-medium text-slate-500">
                {condSummary.condTotal} Total Fields Evaluated
              </span>
            </div>

            {condSummary.condRulesApplied > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-600">
                  <span>Applied Rules Outcome</span>
                  <span>{condSummary.condValid + condSummary.condValidPartial} / {condSummary.condRulesApplied} Passing</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex shadow-inner">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-500"
                    style={{ width: `${(condSummary.condValid / condSummary.condRulesApplied) * 100}%` }}
                    title={`Valid: ${condSummary.condValid}`}
                  />
                  <div
                    className="bg-teal-500 h-full transition-all duration-500"
                    style={{ width: `${(condSummary.condValidPartial / condSummary.condRulesApplied) * 100}%` }}
                    title={`Valid - Partial: ${condSummary.condValidPartial}`}
                  />
                  <div
                    className="bg-red-500 h-full transition-all duration-500"
                    style={{ width: `${(condSummary.condInvalid / condSummary.condRulesApplied) * 100}%` }}
                    title={`Invalid: ${condSummary.condInvalid}`}
                  />
                  <div
                    className="bg-amber-400 h-full transition-all duration-500"
                    style={{ width: `${(condSummary.condNotAutomated / condSummary.condRulesApplied) * 100}%` }}
                    title={`Not Automated: ${condSummary.condNotAutomated}`}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3">
                <div className="text-xs text-emerald-800 font-semibold">Valid</div>
                <div className="text-xl font-bold text-emerald-600 mt-0.5">{condSummary.condValid}</div>
              </div>
              <div className="bg-teal-50/60 border border-teal-100 rounded-xl p-3">
                <div className="text-xs text-teal-800 font-semibold">Valid - Partial</div>
                <div className="text-xl font-bold text-teal-600 mt-0.5">{condSummary.condValidPartial}</div>
              </div>
              <div className="bg-red-50/60 border border-red-100 rounded-xl p-3">
                <div className="text-xs text-red-800 font-semibold">Invalid</div>
                <div className="text-xl font-bold text-red-600 mt-0.5">{condSummary.condInvalid}</div>
              </div>
              <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3">
                <div className="text-xs text-amber-800 font-semibold">Not Automated</div>
                <div className="text-xl font-bold text-amber-600 mt-0.5">{condSummary.condNotAutomated}</div>
              </div>
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3">
                <div className="text-xs text-slate-600 font-semibold">Condition Not Met</div>
                <div className="text-xl font-bold text-slate-700 mt-0.5">{condSummary.condNotMet}</div>
              </div>
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3">
                <div className="text-xs text-slate-600 font-semibold">No Rule</div>
                <div className="text-xl font-bold text-slate-700 mt-0.5">{condSummary.condNoRule}</div>
              </div>
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3">
                <div className="text-xs text-slate-600 font-semibold">Blank Value</div>
                <div className="text-xl font-bold text-slate-700 mt-0.5">{condSummary.condBlank}</div>
              </div>
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3">
                <div className="text-xs text-slate-600 font-semibold">Informational</div>
                <div className="text-xl font-bold text-slate-700 mt-0.5">{condSummary.condInfo}</div>
              </div>
              {condSummary.condUnclassified > 0 && (
                <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-3">
                  <div className="text-xs text-purple-800 font-semibold">Unclassified</div>
                  <div className="text-xl font-bold text-purple-600 mt-0.5">{condSummary.condUnclassified}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ValidationSummaryCards;
