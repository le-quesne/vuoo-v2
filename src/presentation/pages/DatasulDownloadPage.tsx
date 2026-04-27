import { useEffect } from 'react';

const FILE_URL = '/Data-Datasul.xlsx';
const FILE_NAME = 'Data-Datasul.xlsx';

export function DatasulDownloadPage() {
  useEffect(() => {
    const link = document.createElement('a');
    link.href = FILE_URL;
    link.download = FILE_NAME;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md rounded-lg bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Descargando Data Datasul…</h1>
        <p className="mt-2 text-sm text-gray-600">
          Si la descarga no inicia automáticamente,{' '}
          <a href={FILE_URL} download={FILE_NAME} className="text-blue-600 underline">
            haz clic aquí
          </a>
          .
        </p>
      </div>
    </div>
  );
}
