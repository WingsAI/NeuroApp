'use client';

import { useEffect, useState } from 'react';
import { Search, User, Calendar, FileCheck, AlertCircle, CheckCircle2, Send } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getPatients, updatePatient, generateId } from '@/lib/storage';
import { Patient, PatientReferral } from '@/types';

export default function Referrals() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [referralForm, setReferralForm] = useState({
    referredBy: '',
    specialty: '',
    urgency: 'routine' as 'routine' | 'urgent' | 'emergency',
    notes: '',
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
    // Filtrar apenas pacientes com laudos concluídos que ainda não foram encaminhados
    const completedPatients = allPatients.filter(
      p => p.status === 'completed' && p.report && !p.referral
    );
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
        p.report?.doctorName.toLowerCase().includes(term)
    );
    setFilteredPatients(filtered);
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowModal(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setReferralForm({
      ...referralForm,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmitReferral = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPatient) return;

    const referral: PatientReferral = {
      id: generateId(),
      patientId: selectedPatient.id,
      referredBy: referralForm.referredBy,
      referralDate: new Date().toISOString(),
      specialty: referralForm.specialty,
      urgency: referralForm.urgency,
      notes: referralForm.notes,
      status: 'pending',
    };

    updatePatient(selectedPatient.id, {
      referral: referral,
    });

    setSuccess(true);

    setTimeout(() => {
      setShowModal(false);
      setSelectedPatient(null);
      setReferralForm({
        referredBy: '',
        specialty: '',
        urgency: 'routine',
        notes: '',
      });
      setSuccess(false);
      loadPatients();
    }, 1500);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatient(null);
    setReferralForm({
      referredBy: '',
      specialty: '',
      urgency: 'routine',
      notes: '',
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const getConditionsList = (conditions: any) => {
    if (!conditions) return [];
    const list = [];
    if (conditions.diabeticRetinopathy) list.push('Retinopatia Diabética');
    if (conditions.glaucoma) list.push('Glaucoma');
    if (conditions.macularDegeneration) list.push('Degeneração Macular');
    if (conditions.cataract) list.push('Catarata');
    return list;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Encaminhamento de Pacientes</h1>
          <p className="text-gray-600">Gerencie os encaminhamentos dos pacientes com laudos concluídos</p>
        </div>

        {/* Barra de Busca */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por paciente, CPF ou médico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Lista de Pacientes */}
        {filteredPatients.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <FileCheck className="mx-auto h-16 w-16 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Nenhum paciente aguardando encaminhamento</h3>
            <p className="mt-2 text-gray-600">
              {searchTerm ? 'Tente ajustar sua busca' : 'Todos os pacientes com laudos já foram encaminhados ou não há laudos concluídos'}
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
                      Médico Laudador
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data do Laudo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Condições Identificadas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPatients.map((patient) => {
                    const conditions = getConditionsList(patient.report?.diagnosticConditions);
                    return (
                      <tr key={patient.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-primary-100 rounded-full flex items-center justify-center">
                              <User className="h-5 w-5 text-primary-600" />
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{patient.name}</div>
                              <div className="text-sm text-gray-500">{patient.location}</div>
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
                          {formatDate(patient.report?.completedAt || '')}
                        </td>
                        <td className="px-6 py-4">
                          {conditions.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {conditions.map((condition, idx) => (
                                <span
                                  key={idx}
                                  className="inline-block px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded"
                                >
                                  {condition}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500">Nenhuma condição identificada</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => handleSelectPatient(patient)}
                            className="inline-flex items-center px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Encaminhar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal de Encaminhamento */}
      {showModal && selectedPatient && selectedPatient.report && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
              <h2 className="text-2xl font-bold text-gray-900">Encaminhamento de Paciente</h2>
            </div>

            <div className="p-6 space-y-6">
              {/* Resumo do Laudo */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Resumo do Laudo</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-gray-600">Paciente</p>
                    <p className="font-medium text-gray-900">{selectedPatient.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Médico Laudador</p>
                    <p className="font-medium text-gray-900">{selectedPatient.report.doctorName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Diagnóstico</p>
                    <p className="font-medium text-gray-900">{selectedPatient.report.diagnosis}</p>
                  </div>
                  {getConditionsList(selectedPatient.report.diagnosticConditions).length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Condições Identificadas</p>
                      <div className="flex flex-wrap gap-2">
                        {getConditionsList(selectedPatient.report.diagnosticConditions).map((condition, idx) => (
                          <span
                            key={idx}
                            className="inline-block px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded"
                          >
                            {condition}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Formulário de Encaminhamento */}
              <form onSubmit={handleSubmitReferral} className="space-y-4">
                <div>
                  <label htmlFor="referredBy" className="block text-sm font-medium text-gray-700 mb-1">
                    Nome do Técnico Responsável *
                  </label>
                  <input
                    type="text"
                    id="referredBy"
                    name="referredBy"
                    value={referralForm.referredBy}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Seu nome completo"
                  />
                </div>

                <div>
                  <label htmlFor="specialty" className="block text-sm font-medium text-gray-700 mb-1">
                    Especialidade para Encaminhamento *
                  </label>
                  <select
                    id="specialty"
                    name="specialty"
                    value={referralForm.specialty}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Selecione a especialidade</option>
                    <option value="Oftalmologia Geral">Oftalmologia Geral</option>
                    <option value="Retina">Retina</option>
                    <option value="Glaucoma">Glaucoma</option>
                    <option value="Catarata">Catarata</option>
                    <option value="Córnea">Córnea</option>
                    <option value="Neuroftalmologia">Neuroftalmologia</option>
                    <option value="Uveíte">Uveíte</option>
                    <option value="Emergência">Emergência</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="urgency" className="block text-sm font-medium text-gray-700 mb-1">
                    Nível de Urgência *
                  </label>
                  <select
                    id="urgency"
                    name="urgency"
                    value={referralForm.urgency}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="routine">Rotina</option>
                    <option value="urgent">Urgente</option>
                    <option value="emergency">Emergência</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                    Observações Adicionais
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={referralForm.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Informações adicionais sobre o encaminhamento..."
                  />
                </div>

                {success && (
                  <div className="flex items-center p-4 bg-green-50 border border-green-200 rounded-md">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mr-2" />
                    <p className="text-sm text-green-800">Encaminhamento registrado com sucesso!</p>
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
                    {success ? 'Encaminhamento Registrado!' : 'Registrar Encaminhamento'}
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
