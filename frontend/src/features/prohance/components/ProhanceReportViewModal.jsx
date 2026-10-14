import React, { useState, useEffect, useMemo } from 'react';
import { DataTable } from '../../../components/DataTable';
import { ModalSkeleton } from '../../../components/SkeletonLoader';
import { ManageColumnsModal } from '../../../components/ManageColumnsModal';
import Tooltip from '../../../components/Tooltip';
import { exportProhanceToExcel } from '../../../utils/excelExport';
import { notify } from '../../../utils/toast';
import { userPreferencesService } from '../../../services/userPreferencesService';

const REPORT_TABS = [
  { id: 'package_time_summary', label: 'Package Time Summary', badgeColor: 'bg-blue-100 text-blue-800' },
  { id: 'unmapped_requires_review', label: 'Unmapped - Requires Review', badgeColor: 'bg-amber-100 text-amber-800' },
  { id: 'unverified_requires_review', label: 'Unverified - Requires Review', badgeColor: 'bg-purple-100 text-purple-800' },
  { id: 'overall_activity_summary', label: 'Overall Activity Summary', badgeColor: 'bg-emerald-100 text-emerald-800' },
  { id: 'overall_by_user', label: 'Overall by User', badgeColor: 'bg-slate-100 text-slate-800' },
];

export const ProhanceReportViewModal = ({ isOpen, onClose, report, loading }) => {
  const [activeSubTab, setActiveSubTab] = useState('package_time_summary');
  const [localTabs, setLocalTabs] = useState({});
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [showManageColumnsModal, setShowManageColumnsModal] = useState(false);
  const [selectedColumnsByTab, setSelectedColumnsByTab] = useState(() => {
    const initial = {};
    REPORT_TABS.forEach((tab) => {
      try {
        const saved =
          localStorage.getItem(`user_cols_prohance_preview_${tab.id}`) ||
          localStorage.getItem(`prohance_preview_cols_${tab.id}`);
        if (saved) {
          initial[tab.id] = JSON.parse(saved);
        }
      } catch (e) {
        console.error('Failed to load column settings from storage:', e);
      }
    });
    return initial;
  });

  // Load column preferences from database on mount / when modal opens
  useEffect(() => {
    if (isOpen) {
      REPORT_TABS.forEach((tab) => {
        const tableKey = `prohance_preview_${tab.id}`;
        userPreferencesService.getColumnPreferences(tableKey).then((cols) => {
          if (cols && Array.isArray(cols) && cols.length > 0) {
            setSelectedColumnsByTab((prev) => ({
              ...prev,
              [tab.id]: cols,
            }));
          }
        });
      });
    }
  }, [isOpen]);

  // Sync report tabs into editable local state
  useEffect(() => {
    if (report && report.tabs) {
      const cloned = {};
      Object.keys(report.tabs).forEach((tabKey) => {
        const rows = report.tabs[tabKey] || [];
        cloned[tabKey] = rows.map((r, i) => ({
          ...r,
          _id: r.id || `${tabKey}_rec_${i}`,
          action: r.action || '',
          remark: r.remark || '',
        }));
      });
      setLocalTabs(cloned);
      setUpdateMessage('');
      setUpdateError('');
    }
  }, [report, isOpen]);

  // Helper: Status Badge
  const getStatusBadge = (status) => {
    if (status === null || status === undefined || status === '') {
      return <span className="text-slate-400 whitespace-nowrap">-</span>;
    }
    const s = String(status);
    const textStyle = "whitespace-nowrap inline-flex items-center font-semibold text-xs";

    if (s === 'TRUE' || s === 'Matched' || s === 'Valid' || s.startsWith('OK')) {
      return <span className={`text-green-700 ${textStyle}`}>{s}</span>;
    }
    if (s === 'FALSE' || s === 'Unmatched' || s.startsWith('Invalid') || s.startsWith('FLAGGED') || s.includes('Unmapped') || s.includes('Unverified')) {
      return <span className={`text-red-700 ${textStyle}`}>{s}</span>;
    }
    if (s.includes('variance') || s.includes('Requires Review') || s.includes('review')) {
      return <span className={`text-amber-700 ${textStyle}`}>{s}</span>;
    }
    return <span className={`text-slate-700 ${textStyle}`}>{s}</span>;
  };

  const handleRecordChange = (recordToUpdate, field, value) => {
    setLocalTabs((prev) => {
      const currentTabRows = prev[activeSubTab] || [];
      const updatedRows = currentTabRows.map((rec) =>
        rec === recordToUpdate || (rec._id && rec._id === recordToUpdate._id)
          ? { ...rec, [field]: value }
          : rec
      );
      return {
        ...prev,
        [activeSubTab]: updatedRows,
      };
    });
  };

  const handleDiscard = () => {
    if (report && report.tabs) {
      const cloned = {};
      Object.keys(report.tabs).forEach((tabKey) => {
        const rows = report.tabs[tabKey] || [];
        cloned[tabKey] = rows.map((r, i) => ({
          ...r,
          _id: r.id || `${tabKey}_rec_${i}`,
          action: r.action || '',
          remark: r.remark || '',
        }));
      });
      setLocalTabs(cloned);
    }
    setUpdateMessage('Changes discarded. Restored previous report data.');
    setUpdateError('');
    setTimeout(() => setUpdateMessage(''), 4000);
  };

  const handleUpdate = async () => {
    setUpdateLoading(true);
    setUpdateMessage('');
    setUpdateError('');

    try {
      // Update local report reference if provided
      if (report && report.tabs) {
        Object.keys(localTabs).forEach((tabKey) => {
          report.tabs[tabKey] = localTabs[tabKey].map((r) => ({ ...r }));
        });
      }
      setUpdateMessage('Prohance report records successfully updated!');
      setTimeout(() => setUpdateMessage(''), 5000);
    } catch (err) {
      setUpdateError(err.message || 'Failed to update report records.');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    try {
      const fn = report?.original_filename || 'Prohance_Report';
      exportProhanceToExcel({
        filename: fn,
        tabs: localTabs,
        reportSuffix: '_Audit_Report',
      });
      notify.success('Excel report downloaded successfully!');
    } catch (err) {
      console.error('Failed to download excel:', err);
      notify.error('Failed to export Excel report.');
    }
  };

  const subTabRows = useMemo(() => {
    return localTabs[activeSubTab] || [];
  }, [localTabs, activeSubTab]);

  const allAvailableColumns = useMemo(() => {
    if (!subTabRows || subTabRows.length === 0) return [];
    const sample = subTabRows[0];
    const keys = Object.keys(sample).filter(
      (key) => key !== '_id' && key !== 'action' && key !== 'remark'
    );

    return keys.map((key) => ({
      header: key,
      accessor: key,
      sortable: true,
      cellClassName: key.toLowerCase().includes('file') ? 'font-semibold text-slate-900' : 'text-slate-700',
      render: (row) => {
        const val = row[key];
        if (val === null || val === undefined) return <span className="text-slate-300">-</span>;
        if (key === 'User Name') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
              {val}
            </span>
          );
        }
        if (key === 'Reason') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
              {val}
            </span>
          );
        }
        if (key === 'Row Type' || key === 'Status') {
          return getStatusBadge(val);
        }
        return <span>{String(val)}</span>;
      },
    }));
  }, [subTabRows]);

  const selectedKeysForTab = useMemo(() => {
    return selectedColumnsByTab[activeSubTab] || [];
  }, [selectedColumnsByTab, activeSubTab]);

  const visibleColumns = useMemo(() => {
    if (!allAvailableColumns || allAvailableColumns.length === 0) return [];
    if (!selectedKeysForTab || selectedKeysForTab.length === 0) {
      return allAvailableColumns;
    }
    return allAvailableColumns.filter((col) => selectedKeysForTab.includes(col.accessor));
  }, [allAvailableColumns, selectedKeysForTab]);

  const subTabColumns = useMemo(() => {
    if (!subTabRows || subTabRows.length === 0) return [];
    return [
      {
        header: 'S.No',
        accessor: '_sno',
        sortable: false,
        headerClassName: 'sticky top-0 left-0 z-40 bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        cellClassName: 'sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        render: (_, index, globalIndexOffset = 0) => (
          <span className="text-slate-500 font-semibold">{globalIndexOffset + index + 1}</span>
        ),
      },
      ...visibleColumns,
    ];
  }, [subTabRows, visibleColumns]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-[98vw] max-w-[98vw] h-[94vh] flex flex-col overflow-hidden animate-fade-in border border-slate-200">

        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-green-500 rounded-full"></span>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Prohance Audit Preview: <span className="font-semibold text-slate-600">{report?.original_filename || 'Loading...'}</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Tooltip text="Manage Columns" position="bottom">
              <button
                type="button"
                onClick={() => setShowManageColumnsModal(true)}
                disabled={loading || !report || allAvailableColumns.length === 0}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer disabled:opacity-50 select-none"
                aria-label="Manage Visible Columns"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 10V7m6 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#24A1DD]/10 text-[#24A1DD] rounded-full border border-[#24A1DD]/20">
                  {visibleColumns.length}/{allAvailableColumns.length}
                </span>
              </button>
            </Tooltip>
            <Tooltip text="Download Excel Report" position="bottom">
              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={loading || !report}
                className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-emerald-600 hover:text-emerald-700 disabled:opacity-50 font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
                aria-label="Download Excel Report"
              >
                <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
            </Tooltip>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 font-semibold rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

        {/* Feedback Banners */}
        {updateMessage && (
          <div className="px-5 py-2 bg-green-50 border-b border-green-200 text-xs sm:text-sm text-green-800 font-semibold flex items-center justify-between animate-fade-in">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {updateMessage}
            </span>
            <button onClick={() => setUpdateMessage('')} className="text-green-600 hover:text-green-800 text-xs font-bold cursor-pointer">✕</button>
          </div>
        )}
        {updateError && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs sm:text-sm text-red-800 font-semibold flex items-center justify-between animate-fade-in">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {updateError}
            </span>
            <button onClick={() => setUpdateError('')} className="text-red-600 hover:text-red-800 text-xs font-bold cursor-pointer">✕</button>
          </div>
        )}

        {/* Loading Spinner or Modal Content */}
        {loading ? (
          <ModalSkeleton />
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-100">
            {/* Sub-tab DataTable */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-3 bg-white">
              <DataTable
                data={subTabRows}
                columns={subTabColumns}
                loading={false}
                searchable={true}
                pagination={true}
                itemsPerPageOptions={[10, 25, 50, 100]}
                defaultItemsPerPage={25}
                emptyMessage={`No records found in ${REPORT_TABS.find((t) => t.id === activeSubTab)?.label || 'this tab'}.`}
                density="compact"
                maxHeight="100%"
                className="flex flex-col min-h-0 h-full"
              />
            </div>

            {/* Bottom-docked Excel Worksheet Tab Selector */}
            <div className="h-10 bg-slate-200 border-t border-slate-300 flex items-center px-4 flex-shrink-0 select-none overflow-x-auto custom-scrollbar">
              <div className="flex items-center h-full gap-[1px]">
                {REPORT_TABS.map((tab) => {
                  const isActive = activeSubTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveSubTab(tab.id)}
                      className={`px-5 h-full flex items-center gap-2 text-xs font-semibold border-r border-slate-300 transition-all rounded-t-sm whitespace-nowrap cursor-pointer ${isActive
                        ? 'bg-white text-slate-900 border-t-2 border-t-[#24A1DD] border-x border-x-slate-300 shadow-xs'
                        : 'bg-slate-100/70 hover:bg-slate-50 text-slate-600 hover:text-slate-800'
                        }`}
                    >
                      <svg className="w-3.5 h-3.5 text-[#24A1DD]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>


      {/* Manage Columns Modal */}
      <ManageColumnsModal
        isOpen={showManageColumnsModal}
        onClose={() => setShowManageColumnsModal(false)}
        allColumns={allAvailableColumns}
        selectedColumnKeys={
          selectedKeysForTab.length > 0 ? selectedKeysForTab : allAvailableColumns.map((c) => c.accessor)
        }
        defaultColumnKeys={allAvailableColumns.map((c) => c.accessor)}
        onApply={async (newKeys) => {
          setSelectedColumnsByTab((prev) => {
            const next = { ...prev, [activeSubTab]: newKeys };
            try {
              localStorage.setItem(`prohance_preview_cols_${activeSubTab}`, JSON.stringify(newKeys));
            } catch (e) {
              console.error('Failed to save column state:', e);
            }
            return next;
          });
          const tableKey = `prohance_preview_${activeSubTab}`;
          const res = await userPreferencesService.saveColumnPreferences(tableKey, newKeys);
          if (res) {
            notify.success('Column preferences saved to database successfully!');
          } else {
            notify.warning('Column preferences applied locally, but failed to sync to database.');
          }
        }}
      />
    </div>
  );
};

export default ProhanceReportViewModal;

