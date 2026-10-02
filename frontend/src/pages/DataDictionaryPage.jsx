import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import Header from '../layout/Header';
import DataDictionaryTable from '../features/dataDictionary/components/DataDictionaryTable';

const DataDictionaryPage = () => {

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden pt-[60px]">
      <Header />
      <main className="flex-1 flex flex-col min-h-0 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-4 flex-shrink-0">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Data Dictionary</h1>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <DataDictionaryTable />
        </div>
      </main>
    </div>
  );
};

export default DataDictionaryPage;
