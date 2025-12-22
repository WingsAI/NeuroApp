'use client';

import React, { useEffect, useState } from 'react';
import { Search, User, Calendar, FileCheck, CheckCircle2, Send, ArrowRight, ShieldCheck, X, AlertTriangle, Clock } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getPatients, updatePatient, generateId } from '@/lib/storage';
import { Patient, PatientReferral } from '@/types';
import { mockPatientsForReferrals } from '@/lib/mockData';

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
    const completedPatients = allPatients.filter(
      (p: Patient) => p.status === 'completed' && p.report && !p.referral
    );

    const combinedPatients = [...mockPatientsForReferrals, ...completedPatients];
    setPatients(combinedPatients);
  };

  const filterPatients = () => {
    if (!searchTerm.trim()) {
      setFilteredPatients(patients);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = patients.filter(
      (p: Patient) =>
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

    if (selectedPatient.id.startsWith('mock-')) {
      setSuccess(true);
      setTimeout(() => {
        setShowModal(false);
        setSelectedPatient(null);
        resetForm();
        setSuccess(false);
      }, 1500);
      return;
    }

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
      resetForm();
      setSuccess(false);
      loadPatients();
    }, 1500);
  };

  const resetForm = () => {
    setReferralForm({
      referredBy: '',
      specialty: '',
      urgency: 'routine',
      notes: '',
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatient(null);
    resetForm();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const getConditionsList = (conditions: Patient['report'] extends { diagnosticConditions: infer C } ? C : any) => {
    if (!conditions) return [];
    const list = [];
    if (conditions.diabeticRetinopathy) list.push('Retinopatia Diabética');
    if (conditions.glaucoma) list.push('Glaucoma');
    if (conditions.macularDegeneration) list.push('Degeneração Macular');
    if (conditions.cataract) list.push('Catarata');
    return list;
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="noise-overlay" />
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="stagger-load space-y-12">
          {/* Header Section */}
          <div className="max-w-2xl">
            <div className="accent-line" />
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal mb-6 leading-[1.1]">
              Encaminhamento de <span className="text-cardinal-700 italic">Pacientes</span>
            </h1>
            <p className="text-lg text-sandstone-600 font-medium">
              Gestão protocolar de encaminhamentos para especialistas e serviços terciários.
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-2xl group">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-sandstone-400 group-focus-within:text-cardinal-700 transition-colors" />
            <input
              type="text"
              placeholder="Buscar por nome, documento ou médico responsável..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="input-premium pl-12 h-14 text-lg shadow-sm"
            />
          </div>

          {/* Results List */}
          {filteredPatients.length === 0 ? (
            <div className="premium-card p-20 text-center bg-sandstone-50/30">
              <div className="relative inline-block mb-6">
                <FileCheck className="h-16 w-16 text-sandstone-200" />
                <div className="absolute -bottom-1 -right-1 p-1 bg-white rounded-full">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">Fila de encaminhamento vazia</h3>
              <p className="text-sandstone-600 font-medium max-w-md mx-auto">
                {searchTerm ? 'Nenhum registro coincide com a busca.' : 'Todos os laudos concluídos foram devidamente encaminhados ou arquivados.'}
              </p>
            </div>
          ) : (
            <div className="premium-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-sandstone-50/50">
                      <th className="px-8 py-5 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Paciente
                      </th>
                      <th className="px-8 py-5 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Documento
                      </th>
                      <th className="px-8 py-5 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Responsável Laudo
                      </th>
                      <th className="px-8 py-5 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Protocolo Clínico
                      </th>
                      <th className="px-8 py-5 text-right text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sandstone-100">
                    {filteredPatients.map((patient) => {
                      const conditions = getConditionsList(patient.report?.diagnosticConditions);
                      return (
                        <tr key={patient.id} className="group hover:bg-cardinal-50/20 transition-all duration-300">
                          <td className="px-8 py-6">
                            <div className="flex items-center space-x-4">
                              <div className="w-10 h-10 bg-sandstone-50 rounded-full flex items-center justify-center text-cardinal-700 group-hover:bg-cardinal-700 group-hover:text-white transition-colors duration-500">
                                <User className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-charcoal">{patient.name}</div>
                                <div className="text-[10px] text-sandstone-400 font-bold uppercase tracking-wider">{patient.location}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-6 text-sm font-medium text-sandstone-600">
                            {patient.cpf}
                          </td>
                          <td className="px-8 py-6">
                            <div className="text-sm font-serif font-bold text-charcoal italic">{patient.report?.doctorName}</div>
                            <div className="text-[10px] text-sandstone-400 flex items-center mt-1">
                              <Calendar className="w-3 h-3 mr-1" />
                              {formatDate(patient.report?.completedAt || '')}
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            {conditions.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {conditions.map((condition, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider bg-cardinal-50 text-cardinal-700 border border-cardinal-100 rounded"
                                  >
                                    {condition}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-sandstone-400 italic">Escrutínio Normal</span>
                            )}
                          </td>
                          <td className="px-8 py-6 text-right">
                            <button
                              onClick={() => handleSelectPatient(patient)}
                              className="inline-flex items-center px-5 py-2.5 bg-cardinal-700 text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-cardinal-800 shadow-sm hover:shadow-lg transition-all group-hover:-translate-y-0.5 active:scale-95"
                            >
                              <Send className="h-3.5 w-3.5 mr-2" />
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
        </div>
      </main>

      {/* Referral Modal */}
      {showModal && selectedPatient && selectedPatient.report && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
          <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm transition-opacity" onClick={closeModal} />

          <div className="relative bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col stagger-load">
            {/* Modal Header */}
            <div className="px-8 py-6 bg-sandstone-50 border-b border-sandstone-100 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-cardinal-700 rounded-xl text-white shadow-lg">
                  <Send className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif font-bold text-charcoal">Gestão de Encaminhamento</h2>
                  <p className="text-sm font-medium text-sandstone-500">Protocolo de Referência Terciária</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-white rounded-full transition-colors text-sandstone-400 hover:text-charcoal border border-transparent hover:border-sandstone-100">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Report Summary Card */}
              <div className="premium-card p-8 bg-cardinal-950/5 relative">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <FileCheck className="w-12 h-12 text-cardinal-700" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-cardinal-800 mb-6 flex items-center">
                  <ShieldCheck className="w-4 h-4 mr-2" /> Síntese do Laudo Clínico
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Paciente</p>
                      <p className="text-base font-serif font-bold text-charcoal leading-tight">{selectedPatient.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Responsável Laudo</p>
                      <p className="text-sm font-serif font-medium text-charcoal italic">{selectedPatient.report.doctorName}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Conclusão Diagnóstica</p>
                      <p className="text-sm font-medium text-sandstone-600 line-clamp-2 italic">"{selectedPatient.report.diagnosis}"</p>
                    </div>
                    {getConditionsList(selectedPatient.report.diagnosticConditions).length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider mb-2">Marcadores de Alerta</p>
                        <div className="flex flex-wrap gap-2">
                          {getConditionsList(selectedPatient.report.diagnosticConditions).map((condition, idx) => (
                            <span key={idx} className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-white text-cardinal-700 border border-cardinal-100 rounded shadow-sm">
                              {condition}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Referral Form */}
              <form onSubmit={handleSubmitReferral} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                      <User className="w-3.5 h-3.5 mr-2" /> Responsável Referral
                    </label>
                    <input
                      type="text"
                      name="referredBy"
                      value={referralForm.referredBy}
                      onChange={handleInputChange}
                      required
                      className="input-premium"
                      placeholder="Nome do Técnico/Médico"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                      <Send className="w-3.5 h-3.5 mr-2" /> Especialidade Destino
                    </label>
                    <select
                      name="specialty"
                      value={referralForm.specialty}
                      onChange={handleInputChange}
                      required
                      className="input-premium"
                    >
                      <option value="">Selecione a especialidade</option>
                      <option value="Oftalmologia Geral">Oftalmologia Geral</option>
                      <option value="Retina">Retina & Vítreo</option>
                      <option value="Glaucoma">Glaucoma</option>
                      <option value="Catarata">Catarata</option>
                      <option value="Córnea">Córnea & Doenças Externas</option>
                      <option value="Neuroftalmologia">Neuroftalmologia</option>
                      <option value="Uveíte">Uveíte & Inflamação</option>
                      <option value="Emergência">Pronto Atendimento</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-6">
                  <label className="text-xs font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                    <AlertTriangle className="w-3.5 h-3.5 mr-2 text-cardinal-700" /> Priorização de Urgência
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { id: 'routine', label: 'Rotina', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50/50' },
                      { id: 'urgent', label: 'Urgente', icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50/50' },
                      { id: 'emergency', label: 'Emergência', icon: AlertTriangle, color: 'text-cardinal-700', bg: 'bg-cardinal-50/50' },
                    ].map((level) => (
                      <div
                        key={level.id}
                        onClick={() => setReferralForm({ ...referralForm, urgency: level.id as any })}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 flex items-center justify-between ${referralForm.urgency === level.id
                          ? 'border-cardinal-700 bg-white shadow-lg -translate-y-1'
                          : 'border-sandstone-100 bg-sandstone-50/30 hover:border-cardinal-200'
                          }`}
                      >
                        <div className="flex items-center space-x-3">
                          <level.icon className={`w-5 h-5 ${level.color}`} />
                          <span className={`text-sm font-bold uppercase tracking-widest ${referralForm.urgency === level.id ? 'text-charcoal' : 'text-sandstone-400'}`}>
                            {level.label}
                          </span>
                        </div>
                        {referralForm.urgency === level.id && (
                          <div className="h-4 w-4 rounded-full bg-cardinal-700 flex items-center justify-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                    <ArrowRight className="w-3.5 h-3.5 mr-2" /> Notas Complementares
                  </label>
                  <textarea
                    name="notes"
                    value={referralForm.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="input-premium py-4"
                    placeholder="Observações pertinentes ao encaminhamento..."
                  />
                </div>

                {success && (
                  <div className="flex items-center p-5 bg-green-50 border border-green-200 rounded-2xl animate-stagger-1">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mr-3" />
                    <p className="text-sm font-bold text-green-800 uppercase tracking-widest">Encaminhamento finalizado com sucesso</p>
                  </div>
                )}

                <div className="pt-8 border-t border-sandstone-100 flex gap-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-8 py-4 text-sandstone-400 font-bold uppercase tracking-widest text-[10px] hover:bg-sandstone-50 rounded-xl transition-colors"
                  >
                    Descartar Rascunho
                  </button>
                  <button
                    type="submit"
                    disabled={success}
                    className="flex-2 btn-cardinal text-sm uppercase tracking-widest font-bold flex items-center justify-center space-x-3"
                  >
                    {success ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Referral Concluído</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        <span>Validar & Enviar Encaminhamento</span>
                      </>
                    )}
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
