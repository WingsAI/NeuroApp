'use client';

import { useEffect, useState } from 'react';
import { Search, User, Calendar, MapPin, Image as ImageIcon, FileText, AlertCircle, CheckCircle2, X } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getPatients, updatePatient, generateId } from '@/lib/storage';
import { Patient, MedicalReport } from '@/types';

export default function Medical() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [reportForm, setReportForm] = useState({
    doctorName: '',
    findings: '',
    diagnosis: '',
    recommendations: '',
  });
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadPatients();
  }, []);

  useEffect(() => {
    filterPatients();
  }, [searchTerm, patients]);

  const loadPatients = () => {
    const allPatients = getPatients();
    // Filtrar apenas pacientes pendentes ou em análise
    const pendingPatients = allPatients.filter(
      p => p.status === 'pending' || p.status === 'in_analysis'
    );
    setPatients(pendingPatients);
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
        p.location.toLowerCase().includes(term)
    );
    setFilteredPatients(filtered);
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowModal(true);

    // Atualizar status para "em análise"
    if (patient.status === 'pending') {
      updatePatient(patient.id, { status: 'in_analysis' });
    }
  };

  const handleReportInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setReportForm({
      ...reportForm,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPatient) return;

    const report: MedicalReport = {
      id: generateId(),
      patientId: selectedPatient.id,
      doctorName: reportForm.doctorName,
      findings: reportForm.findings,
      diagnosis: reportForm.diagnosis,
      recommendations: reportForm.recommendations,
      completedAt: new Date().toISOString(),
    };

    updatePatient(selectedPatient.id, {
      status: 'completed',
      report: report,
    });

    setSuccess(true);

    setTimeout(() => {
      setShowModal(false);
      setSelectedPatient(null);
      setReportForm({
        doctorName: '',
        findings: '',
        diagnosis: '',
        recommendations: '',
      });
      setSuccess(false);
      loadPatients();
    }, 1500);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatient(null);
    setReportForm({
      doctorName: '',
      findings: '',
      diagnosis: '',
      recommendations: '',
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Fila de Laudos</h1>
          <p className="text-gray-600">Selecione um paciente para realizar a análise e elaborar o laudo</p>
        </div>

        {/* Barra de Busca */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, CPF ou local..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Lista de Pacientes */}
        {filteredPatients.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <FileText className="mx-auto h-16 w-16 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Nenhum paciente encontrado</h3>
            <p className="mt-2 text-gray-600">
              {searchTerm ? 'Tente ajustar sua busca' : 'Não há pacientes aguardando análise no momento'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPatients.map((patient) => (
              <div
                key={patient.id}
                className="bg-white rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleSelectPatient(patient)}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center">
                      <div className="p-2 bg-primary-100 rounded-lg">
                        <User className="h-6 w-6 text-primary-600" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-lg font-semibold text-gray-900">{patient.name}</h3>
                        <p className="text-sm text-gray-600">{patient.cpf}</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        patient.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {patient.status === 'pending' ? 'Pendente' : 'Em Análise'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="h-4 w-4 mr-2" />
                      Data do Exame: {formatDate(patient.examDate)}
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <MapPin className="h-4 w-4 mr-2" />
                      {patient.location}
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <ImageIcon className="h-4 w-4 mr-2" />
                      {patient.images.length} imagens anexadas
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-xs text-gray-500">
                      Técnico: {patient.technicianName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Registrado: {formatDate(patient.createdAt)}
                    </p>
                  </div>

                  <button className="mt-4 w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 transition-colors">
                    Analisar Paciente
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal de Análise */}
      {showModal && selectedPatient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Análise de Paciente</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6">
              {/* Informações do Paciente */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Informações do Paciente</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Nome</p>
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
                    <p className="text-sm text-gray-600">Data do Exame</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedPatient.examDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Local do Exame</p>
                    <p className="font-medium text-gray-900">{selectedPatient.location}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Técnico Responsável</p>
                    <p className="font-medium text-gray-900">{selectedPatient.technicianName}</p>
                  </div>
                </div>
              </div>

              {/* Imagens do Paciente */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Imagens Neuroftalmológicas</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {selectedPatient.images.map((image, index) => (
                    <div key={image.id} className="border border-gray-300 rounded-lg overflow-hidden">
                      <img
                        src={image.data}
                        alt={`Imagem ${index + 1}`}
                        className="w-full h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(image.data, '_blank')}
                      />
                      <div className="p-2 bg-gray-50">
                        <p className="text-xs text-gray-600 truncate">{image.fileName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Formulário de Laudo */}
              <form onSubmit={handleSubmitReport} className="space-y-4">
                <div>
                  <label htmlFor="doctorName" className="block text-sm font-medium text-gray-700 mb-1">
                    Nome do Médico *
                  </label>
                  <input
                    type="text"
                    id="doctorName"
                    name="doctorName"
                    value={reportForm.doctorName}
                    onChange={handleReportInputChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Dr(a). Nome Completo"
                  />
                </div>

                <div>
                  <label htmlFor="findings" className="block text-sm font-medium text-gray-700 mb-1">
                    Achados Clínicos *
                  </label>
                  <textarea
                    id="findings"
                    name="findings"
                    value={reportForm.findings}
                    onChange={handleReportInputChange}
                    required
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Descreva os achados observados nas imagens..."
                  />
                </div>

                <div>
                  <label htmlFor="diagnosis" className="block text-sm font-medium text-gray-700 mb-1">
                    Diagnóstico *
                  </label>
                  <textarea
                    id="diagnosis"
                    name="diagnosis"
                    value={reportForm.diagnosis}
                    onChange={handleReportInputChange}
                    required
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Diagnóstico baseado nas análises..."
                  />
                </div>

                <div>
                  <label htmlFor="recommendations" className="block text-sm font-medium text-gray-700 mb-1">
                    Recomendações *
                  </label>
                  <textarea
                    id="recommendations"
                    name="recommendations"
                    value={reportForm.recommendations}
                    onChange={handleReportInputChange}
                    required
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Recomendações e encaminhamentos..."
                  />
                </div>

                {success && (
                  <div className="flex items-center p-4 bg-green-50 border border-green-200 rounded-md">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mr-2" />
                    <p className="text-sm text-green-800">Laudo salvo com sucesso!</p>
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 px-6 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={success}
                    className="flex-1 bg-primary-600 text-white py-3 px-6 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 font-medium"
                  >
                    {success ? 'Laudo Salvo!' : 'Salvar Laudo'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
