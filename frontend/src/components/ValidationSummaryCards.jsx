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

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in font-creato">
      {/* General Summary Card */}
      <div className="bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-3xl border border-[var(--border)] shadow-sm p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-6">General Statistics</h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl p-4 text-center">
            <div className="text-3xl font-extrabold text-[var(--text-primary)]">{totalFields}</div>
            <div className="text-xs text-[var(--text-secondary)] mt-1 font-semibold">Total Fields</div>
          </div>
          <div className="bg-[var(--success-bg)] border border-[var(--success)]/30 rounded-2xl p-4 text-center">
            <div className="text-3xl font-extrabold text-[var(--success)]">{summary["Final Valid"] ?? 0}</div>
            <div className="text-xs text-[var(--success)] mt-1 font-semibold">Final Valid</div>
          </div>
          <div className="bg-[var(--error-bg)] border border-[var(--error)]/30 rounded-2xl p-4 text-center">
            <div className="text-3xl font-extrabold text-[var(--error)]">{summary["Final Invalid"] ?? 0}</div>
            <div className="text-xs text-[var(--error)] mt-1 font-semibold">Final Invalid</div>
          </div>
          <div className="bg-[var(--warning-bg)] border border-[var(--warning)]/30 rounded-2xl p-4 text-center">
            <div className="text-3xl font-extrabold text-[var(--warning)]">{summary["Review Required"] ?? 0}</div>
            <div className="text-xs text-[var(--warning)] mt-1 font-semibold">Review Required</div>
          </div>
        </div>
      </div>

      {/* Detailed Analysis Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Dictionary Matches */}
        <div className="bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-3xl border border-[var(--border)] shadow-sm p-6 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2">
            Dictionary Match Checks ({totalFields} Total)
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)] font-semibold">Matched Fields</span>
              <span className="font-bold text-[var(--success)]">{matched}</span>
            </div>
            <div className="w-full bg-[var(--bg-elevated)] rounded-full h-2 border border-[var(--border)]">
              <div
                className="bg-[var(--success)] h-full rounded-full transition-all duration-500"
                style={{ width: `${matchPct}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-sm pt-2">
              <span className="text-[var(--text-secondary)] font-semibold">Unmatched Fields</span>
              <span className="font-bold text-[var(--error)]">{unmatched}</span>
            </div>
          </div>
        </div>

        {/* Data Type Checks */}
        <div className="bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-3xl border border-[var(--border)] shadow-sm p-6 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2">
            Data Type Validation ({typeTotal} Total)
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)] font-semibold">Type Check Pass</span>
              <span className="font-bold text-[var(--success)]">{typePass}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)] font-semibold">Type Check Fail</span>
              <span className="font-bold text-[var(--error)]">{typeFail}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)] font-semibold">Blank Values (N/A)</span>
              <span className="font-bold text-[var(--text-disabled)]">{blankValues}</span>
            </div>
          </div>
        </div>

        {/* Enum Checks */}
        <div className="bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-3xl border border-[var(--border)] shadow-sm p-6 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2">
            Enumeration Checks ({totalEnum} Total)
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)] font-semibold">Enum Valid</span>
              <span className="font-bold text-[var(--success)]">{enumPass}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)] font-semibold">Format Variance (Warnings)</span>
              <span className="font-bold text-[var(--warning)]">{enumVariance}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)] font-semibold">Enum Fail</span>
              <span className="font-bold text-[var(--error)]">{enumFail}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)] font-semibold">Enum No List</span>
              <span className="font-bold text-[var(--text-disabled)]">{enumNoList}</span>
            </div>
          </div>
        </div>

        {/* Condition Validation */}
        {condSummary && (
          <div className="bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-3xl border border-[var(--border)] shadow-sm p-6 space-y-4 md:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Condition Validation ({condSummary.condRulesApplied} Rules Applied)
              </h4>
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {condSummary.condTotal} Total Fields Evaluated
              </span>
            </div>

            {condSummary.condRulesApplied > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-[var(--text-secondary)]">
                  <span>Applied Rules Outcome</span>
                  <span>{condSummary.condValid + condSummary.condValidPartial} / {condSummary.condRulesApplied} Passing</span>
                </div>
                <div className="w-full bg-[var(--bg-elevated)] rounded-full h-2.5 overflow-hidden flex border border-[var(--border)]">
                  <div
                    className="bg-[var(--success)] h-full transition-all duration-500"
                    style={{ width: `${(condSummary.condValid / condSummary.condRulesApplied) * 100}%` }}
                    title={`Valid: ${condSummary.condValid}`}
                  />
                  <div
                    className="bg-teal-500 h-full transition-all duration-500"
                    style={{ width: `${(condSummary.condValidPartial / condSummary.condRulesApplied) * 100}%` }}
                    title={`Valid - Partial: ${condSummary.condValidPartial}`}
                  />
                  <div
                    className="bg-[var(--error)] h-full transition-all duration-500"
                    style={{ width: `${(condSummary.condInvalid / condSummary.condRulesApplied) * 100}%` }}
                    title={`Invalid: ${condSummary.condInvalid}`}
                  />
                  <div
                    className="bg-[var(--warning)] h-full transition-all duration-500"
                    style={{ width: `${(condSummary.condNotAutomated / condSummary.condRulesApplied) * 100}%` }}
                    title={`Not Automated: ${condSummary.condNotAutomated}`}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div className="bg-[var(--success-bg)] border border-[var(--success)]/30 rounded-xl p-3">
                <div className="text-xs text-[var(--success)] font-semibold">Valid</div>
                <div className="text-xl font-bold text-[var(--success)] mt-0.5">{condSummary.condValid}</div>
              </div>
              <div className="bg-teal-500/10 border border-teal-500/30 rounded-xl p-3">
                <div className="text-xs text-teal-500 font-semibold">Valid - Partial</div>
                <div className="text-xl font-bold text-teal-500 mt-0.5">{condSummary.condValidPartial}</div>
              </div>
              <div className="bg-[var(--error-bg)] border border-[var(--error)]/30 rounded-xl p-3">
                <div className="text-xs text-[var(--error)] font-semibold">Invalid</div>
                <div className="text-xl font-bold text-[var(--error)] mt-0.5">{condSummary.condInvalid}</div>
              </div>
              <div className="bg-[var(--warning-bg)] border border-[var(--warning)]/30 rounded-xl p-3">
                <div className="text-xs text-[var(--warning)] font-semibold">Not Automated</div>
                <div className="text-xl font-bold text-[var(--warning)] mt-0.5">{condSummary.condNotAutomated}</div>
              </div>
              <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-xs text-[var(--text-secondary)] font-semibold">Condition Not Met</div>
                <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{condSummary.condNotMet}</div>
              </div>
              <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-xs text-[var(--text-secondary)] font-semibold">No Rule</div>
                <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{condSummary.condNoRule}</div>
              </div>
              <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-xs text-[var(--text-secondary)] font-semibold">Blank Value</div>
                <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{condSummary.condBlank}</div>
              </div>
              <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-xs text-[var(--text-secondary)] font-semibold">Informational</div>
                <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{condSummary.condInfo}</div>
              </div>
              {condSummary.condUnclassified > 0 && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
                  <div className="text-xs text-purple-400 font-semibold">Unclassified</div>
                  <div className="text-xl font-bold text-purple-400 mt-0.5">{condSummary.condUnclassified}</div>
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
