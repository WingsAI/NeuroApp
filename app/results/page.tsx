'use client';

import { useEffect, useState } from 'react';
import { Search, FileText, User, Calendar, MapPin, Download, Printer, Eye, Image as ImageIcon } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getPatients } from '@/lib/storage';
import { Patient } from '@/types';

export default function Results() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadPatients();
  }, []);

  useEffect(() => {
    filterPatients();
  }, [searchTerm, patients]);

  const loadPatients = () => {
    const allPatients = getPatients();
    // Filtrar apenas pacientes com laudos concluídos
    const completedPatients = allPatients.filter(p => p.status === 'completed' && p.report);
    setPatients(completedPatients);
  };

  const filterPatients = () => {
    if (!searchTerm.trim()) {
      setFilteredPatients(patients);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = patients.filter(
      p =>
        p.name.toLowerCase().includes(term) ||
        p.cpf.includes(term) ||
        p.report?.doctorName.toLowerCase().includes(term) ||
        p.location.toLowerCase().includes(term)
    );
    setFilteredPatients(filtered);
  };

  const handleViewReport = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatient(null);
  };

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Resultados de Laudos</h1>
          <p className="text-gray-600">Visualize e gerencie os laudos médicos concluídos</p>
        </div>

        {/* Barra de Busca */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por paciente, CPF, médico ou local..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Lista de Resultados */}
        {filteredPatients.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <FileText className="mx-auto h-16 w-16 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Nenhum resultado encontrado</h3>
            <p className="mt-2 text-gray-600">
              {searchTerm ? 'Tente ajustar sua busca' : 'Não há laudos concluídos no momento'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Paciente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CPF
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Médico
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data do Exame
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Local
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Laudo Concluído
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPatients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-primary-100 rounded-full flex items-center justify-center">
                            <User className="h-5 w-5 text-primary-600" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{patient.name}</div>
                            <div className="text-sm text-gray-500">
                              {new Date().getFullYear() - new Date(patient.birthDate).getFullYear()} anos
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {patient.cpf}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {patient.report?.doctorName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(patient.examDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {patient.location}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDateTime(patient.report?.completedAt || '')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleViewReport(patient)}
                          className="inline-flex items-center px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver Laudo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal de Visualização do Laudo */}
      {showModal && selectedPatient && selectedPatient.report && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Cabeçalho do Modal */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Laudo Médico</h2>
              <div className="flex gap-2">
                <button
                  onClick={handlePrint}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
                  title="Imprimir"
                >
                  <Printer className="h-5 w-5" />
                </button>
                <button
                  onClick={closeModal}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
                  title="Fechar"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Conteúdo do Laudo */}
            <div className="p-6 space-y-6">
              {/* Header do Laudo */}
              <div className="text-center border-b border-gray-200 pb-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">LAUDO NEUROFTALMOLÓGICO</h3>
                <p className="text-sm text-gray-600">
                  Número do Laudo: {selectedPatient.report.id}
                </p>
              </div>

              {/* Informações do Paciente */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <User className="h-5 w-5 mr-2 text-primary-600" />
                  Informações do Paciente
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Nome Completo</p>
                    <p className="font-medium text-gray-900">{selectedPatient.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">CPF</p>
                    <p className="font-medium text-gray-900">{selectedPatient.cpf}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Data de Nascimento</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedPatient.birthDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Idade</p>
                    <p className="font-medium text-gray-900">
                      {new Date().getFullYear() - new Date(selectedPatient.birthDate).getFullYear()} anos
                    </p>
                  </div>
                </div>
              </div>

              {/* Informações do Exame */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <Calendar className="h-5 w-5 mr-2 text-primary-600" />
                  Informações do Exame
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Data do Exame</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedPatient.examDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Local do Exame</p>
                    <p className="font-medium text-gray-900 flex items-center">
                      <MapPin className="h-4 w-4 mr-1" />
                      {selectedPatient.location}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Técnico Responsável</p>
                    <p className="font-medium text-gray-900">{selectedPatient.technicianName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Data do Laudo</p>
                    <p className="font-medium text-gray-900">{formatDateTime(selectedPatient.report.completedAt)}</p>
                  </div>
                </div>
              </div>

              {/* Imagens do Exame */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <ImageIcon className="h-5 w-5 mr-2 text-primary-600" />
                  Imagens do Exame ({selectedPatient.images.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {selectedPatient.images.map((image, index) => (
                    <div key={image.id} className="border border-gray-300 rounded-lg overflow-hidden">
                      <img
                        src={image.data}
                        alt={`Imagem ${index + 1}`}
                        className="w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(image.data, '_blank')}
                      />
                      <div className="p-2 bg-gray-50 text-center">
                        <p className="text-xs text-gray-600">Imagem {index + 1}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Laudo Médico */}
              <div className="border-t border-gray-200 pt-6">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-primary-600" />
                  Laudo Médico
                </h4>

                <div className="space-y-4">
                  <div>
                    <h5 className="font-medium text-gray-900 mb-2">Médico Responsável</h5>
                    <p className="text-gray-700">{selectedPatient.report.doctorName}</p>
                  </div>

                  <div>
                    <h5 className="font-medium text-gray-900 mb-2">Achados Clínicos</h5>
                    <p className="text-gray-700 whitespace-pre-wrap">{selectedPatient.report.findings}</p>
                  </div>

                  <div>
                    <h5 className="font-medium text-gray-900 mb-2">Diagnóstico</h5>
                    <p className="text-gray-700 whitespace-pre-wrap">{selectedPatient.report.diagnosis}</p>
                  </div>

                  <div>
                    <h5 className="font-medium text-gray-900 mb-2">Recomendações</h5>
                    <p className="text-gray-700 whitespace-pre-wrap">{selectedPatient.report.recommendations}</p>
                  </div>
                </div>
              </div>

              {/* Assinatura */}
              <div className="border-t border-gray-200 pt-6 text-center">
                <div className="inline-block">
                  <div className="border-t-2 border-gray-400 pt-2 min-w-[300px]">
                    <p className="font-medium text-gray-900">{selectedPatient.report.doctorName}</p>
                    <p className="text-sm text-gray-600">Médico Responsável</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDateTime(selectedPatient.report.completedAt)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer do Modal */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
              >
                Fechar
              </button>
              <button
                onClick={handlePrint}
                className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 font-medium flex items-center"
              >
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
