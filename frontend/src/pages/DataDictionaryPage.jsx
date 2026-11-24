import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import Header from '../layout/Header';
import DataDictionaryTable from '../features/dataDictionary/components/DataDictionaryTable';

const DataDictionaryPage = () => {

  return (
    <div className="h-[100dvh] flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden pt-[60px] transition-colors duration-200">
      <Header />
      <main className="flex-1 flex flex-col min-h-0 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3.5 sm:py-6">
        <div className="mb-3 sm:mb-4 flex-shrink-0">
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">Data Dictionary</h1>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <DataDictionaryTable />
        </div>
      </main>
    </div>
  );
};

export default DataDictionaryPage;
