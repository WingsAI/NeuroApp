'use client';

import React, { useEffect, useState } from 'react';
import {
  Search, User, Calendar, FileCheck, CheckCircle2, Send,
  ArrowRight, ShieldCheck, X, AlertTriangle, Clock,
  Activity, MapPin, ChevronRight, Filter, ChevronDown,
  Loader2, CheckSquare, Square
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getPatientsAction, updatePatientAction } from '@/app/actions/patients';
import { Patient } from '@/types';

export default function Referrals() {
  const [patients, setPatients] = useState<any[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [referralForm, setReferralForm] = useState({
    referredBy: '',
    specialty: '',
    urgency: 'routine' as 'routine' | 'urgent' | 'emergency',
    notes: '',
    specializedService: '',
    scheduledDate: '',
  });
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPatients();
  }, []);

  useEffect(() => {
    filterPatients();
  }, [searchTerm, patients]);

  const loadPatients = async () => {
    const allPatients = await getPatientsAction() as any[];

    // In the new model, we want to find EXAMS that are completed but not yet scheduled.
    // We flatten the list so each row in this table is a visit (Exam).
    const pendingScheduling: any[] = [];

    allPatients.forEach(patient => {
      patient.exams.forEach((exam: any) => {
        if (exam.status === 'completed' && exam.report && (!exam.referral || !exam.referral.scheduledDate)) {
          pendingScheduling.push({
            ...patient, // Patient demograhics
            ...exam,    // Exam details (id, status, referral, report, location, examDate)
            patientName: patient.name,
            patientCpf: patient.cpf,
            examId: exam.id,
            patientId: patient.id
          });
        }
      });
    });

    setPatients(pendingScheduling);
  };

  const filterPatients = () => {
    if (!searchTerm.trim()) {
      setFilteredPatients(patients);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = patients.filter(
      (p: any) =>
        p.name.toLowerCase().includes(term) ||
        (p.cpf && p.cpf.includes(term)) ||
        p.location.toLowerCase().includes(term)
    );
    setFilteredPatients(filtered);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setReferralForm(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredPatients.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPatients.map(p => p.examId));
    }
  };

  const handleOpenReferral = (patient: any) => {
    setSelectedPatient(patient);
    // Pre-fill form if referral already exists
    if (patient.referral) {
      setReferralForm({
        referredBy: patient.referral.referredBy || '',
        specialty: patient.referral.specialty || '',
        urgency: (patient.referral.urgency as any) || 'routine',
        notes: patient.referral.notes || '',
        specializedService: patient.referral.specializedService || '',
        scheduledDate: patient.referral.scheduledDate ? new Date(patient.referral.scheduledDate).toISOString().split('T')[0] : '',
      });
    } else {
      // Suggest specialty based on suggested conduct if it matches known specialties
      const conduct = (patient.report?.suggestedConduct || '').toLowerCase();
      let suggestedSpecialty = '';
      if (conduct.includes('glaucoma')) suggestedSpecialty = 'Glaucoma';
      else if (conduct.includes('retina')) suggestedSpecialty = 'Retina';
      else if (conduct.includes('catarata')) suggestedSpecialty = 'Catarata';
      else if (conduct.includes('neuro')) suggestedSpecialty = 'Neuroftalmologia';

      setReferralForm({
        referredBy: '',
        specialty: suggestedSpecialty,
        urgency: 'routine',
        notes: '',
        specializedService: '',
        scheduledDate: '',
      });
    }
    setShowModal(true);
  };

  const handleSubmitReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;

    setLoading(true);

    const referralData = {
      ...referralForm,
      referralDate: selectedPatient.referral?.referralDate || new Date().toISOString(),
      scheduledDate: referralForm.scheduledDate ? new Date(referralForm.scheduledDate).toISOString() : null,
      status: referralForm.scheduledDate ? 'scheduled' : 'pending',
    };

    // Use updateExamAction instead of updatePatientAction
    const { updateExamAction } = await import('@/app/actions/patients');

    await updateExamAction(selectedPatient.examId, {
      referral: referralData,
    });

    setSuccess(true);
    setTimeout(() => {
      setShowModal(false);
      setSelectedPatient(null);
      setSuccess(false);
      setLoading(false);
      loadPatients();
    }, 1500);
  };

  const handleBulkSchedule = async () => {
    if (selectedIds.length === 0) return;

    const date = prompt("Digite a data de agendamento para os pacientes selecionados (AAAA-MM-DD):", new Date().toISOString().split('T')[0]);
    if (!date) return;

    setLoading(true);
    const techName = prompt("Nome do Técnico Responsável:", referralForm.referredBy) || "Técnico";

    for (const id of selectedIds) {
      const patient = patients.find(p => p.id === id);
      if (!patient) continue;

      const referralData = {
        referredBy: techName,
        specialty: patient.referral?.specialty || 'Oftalmologia Geral',
        urgency: patient.referral?.urgency || 'routine',
        notes: patient.referral?.notes || 'Agendamento em lote',
        specializedService: patient.referral?.specializedService || '',
        referralDate: patient.referral?.referralDate || new Date().toISOString(),
        scheduledDate: new Date(date).toISOString(),
        status: 'scheduled',
      };

      const { updateExamAction } = await import('@/app/actions/patients');
      await updateExamAction(patient.examId, { referral: referralData });
    }

    setSuccess(true);
    setSelectedIds([]);
    setTimeout(() => {
      setSuccess(false);
      setLoading(false);
      loadPatients();
    }, 1500);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <div className="min-h-screen bg-sandstone-50/30 relative">
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03] pointer-events-none" />
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="stagger-load space-y-8">
          {/* Header Block */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-cardinal-50 text-cardinal-700 text-[10px] font-bold uppercase tracking-widest border border-cardinal-100">
                Operação Técnica
              </div>
              <h1 className="text-4xl font-serif font-bold text-charcoal leading-tight">
                Gestão de <span className="text-cardinal-700 italic">Encaminhamentos</span>
              </h1>
              <p className="text-sandstone-500 font-medium max-w-xl">
                Agende e valide os encaminhamentos sugeridos pelos médicos laudadores para as unidades de referência.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-white p-2 rounded-xl shadow-sm border border-sandstone-200 flex items-center gap-2">
                <Filter className="w-4 h-4 text-sandstone-400" />
                <span className="text-[10px] font-bold uppercase text-sandstone-500 pr-2 border-r border-sandstone-100">Filtrar</span>
                <select className="bg-transparent text-[10px] font-bold uppercase text-charcoal outline-none cursor-pointer">
                  <option>Todos Pendentes</option>
                  <option>Urgência Alta</option>
                  <option>Mais Recentes</option>
                </select>
              </div>
            </div>
          </div>

          {/* Action Bar & Search */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-sandstone-200">
            <div className="relative w-full md:max-w-md group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-sandstone-400 group-focus-within:text-cardinal-700 transition-colors" />
              <input
                type="text"
                placeholder="Localizar paciente por nome ou CPF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-sandstone-50 border border-sandstone-100 rounded-xl pl-12 pr-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-cardinal-700/5 focus:border-cardinal-700/20 transition-all shadow-inner"
              />
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto">
              {selectedIds.length > 0 && (
                <button
                  onClick={handleBulkSchedule}
                  className="flex-1 md:flex-none px-6 py-3 bg-cardinal-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-cardinal-700/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  Agendar Selecionados ({selectedIds.length})
                </button>
              )}
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[10px] font-bold text-sandstone-400 uppercase tracking-widest">Aguardando Scheduling</span>
                <span className="text-xl font-serif font-bold text-charcoal">{patients.length} pacientes</span>
              </div>
            </div>
          </div>

          {/* Horizontal List Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-sandstone-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-sandstone-50/50 border-b border-sandstone-100">
                    <th className="p-5 w-12 text-center">
                      <button onClick={toggleSelectAll} className="text-sandstone-300 hover:text-cardinal-700 transition-colors">
                        {selectedIds.length === filteredPatients.length && filteredPatients.length > 0 ? (
                          <CheckSquare className="w-5 h-5 text-cardinal-700" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </th>
                    <th className="py-5 px-4 text-left text-[10px] font-bold uppercase tracking-widest text-sandstone-400">Paciente</th>
                    <th className="py-5 px-4 text-left text-[10px] font-bold uppercase tracking-widest text-sandstone-400">Diagnóstico Principal</th>
                    <th className="py-5 px-4 text-left text-[10px] font-bold uppercase tracking-widest text-sandstone-400">Conduta Sugerida</th>
                    <th className="py-5 px-4 text-center text-[10px] font-bold uppercase tracking-widest text-sandstone-400">Urgência</th>
                    <th className="py-5 px-4 text-right text-[10px] font-bold uppercase tracking-widest text-sandstone-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sandstone-50">
                  {filteredPatients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <div className="flex flex-col items-center justify-center space-y-4">
                          <Send className="w-12 h-12 text-sandstone-200" />
                          <p className="text-sandstone-500 font-medium">Nenhum encaminhamento pendente no momento.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredPatients.map((patient) => {
                      const diagnosis = patient.report?.diagnosis || '';
                      const mainDiagnosis = diagnosis.includes(' - ') ? diagnosis.split(' - ')[0] : diagnosis;
                      const suggestedConduct = patient.report?.suggestedConduct || (diagnosis.includes(' - ') ? diagnosis.split(' - ').slice(1).join(' - ') : '');
                      const urgency = patient.referral?.urgency || 'routine';

                      return (
                        <tr
                          key={patient.id}
                          className={`group hover:bg-sandstone-50/50 transition-all cursor-pointer ${selectedIds.includes(patient.id) ? 'bg-cardinal-50/30' : ''}`}
                          onClick={() => handleOpenReferral(patient)}
                        >
                          <td className="p-5 text-center">
                            <button
                              onClick={(e) => toggleSelect(patient.id, e)}
                              className={`transition-colors ${selectedIds.includes(patient.id) ? 'text-cardinal-700' : 'text-sandstone-200 group-hover:text-sandstone-400'}`}
                            >
                              {selectedIds.includes(patient.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                            </button>
                          </td>
                          <td className="py-5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-sandstone-100 rounded-lg flex items-center justify-center text-sandstone-400 group-hover:bg-cardinal-700 group-hover:text-white transition-all">
                                <User className="w-5 h-5" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-charcoal">{patient.name}</h4>
                                <div className="flex items-center gap-2 text-[10px] font-bold text-sandstone-400 uppercase tracking-tighter">
                                  <span>{patient.location}</span>
                                  <span>•</span>
                                  <span>{formatDate(patient.examDate)}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-5 px-4">
                            <p className="text-sm font-serif font-bold text-charcoal italic line-clamp-1">{mainDiagnosis}</p>
                          </td>
                          <td className="py-5 px-4">
                            <p className="text-xs text-sandstone-500 italic max-w-xs line-clamp-1">{suggestedConduct || 'Aguardando avaliação detalhada'}</p>
                          </td>
                          <td className="py-5 px-4 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${urgency === 'emergency' ? 'bg-red-50 text-red-700 border-red-100' :
                              urgency === 'urgent' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                'bg-green-50 text-green-700 border-green-100'
                              }`}>
                              {urgency === 'emergency' ? 'Emergência' : urgency === 'urgent' ? 'Urgente' : 'Rotina'}
                            </span>
                          </td>
                          <td className="py-5 px-4 text-right">
                            <button className="p-2 bg-sandstone-50 text-sandstone-400 rounded-lg group-hover:bg-cardinal-700 group-hover:text-white transition-all border border-sandstone-200 group-hover:border-cardinal-700">
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Referral/Scheduling Modal */}
      {showModal && selectedPatient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
          <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm transition-opacity" onClick={() => setShowModal(false)} />

          <div className="relative bg-white w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col stagger-load border border-sandstone-100">
            {/* Modal Header */}
            <div className="px-8 py-6 bg-sandstone-50 border-b border-sandstone-100 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-cardinal-700 rounded-2xl text-white shadow-lg shadow-cardinal-700/20">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif font-bold text-charcoal">Agendamento de Encaminhamento</h2>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-sandstone-400">Validação Técnica e Logística</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-sandstone-100 rounded-full transition-colors text-sandstone-400 border border-transparent"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Doctor's Note Summary */}
              <div className="bg-sandstone-50/50 p-6 rounded-2xl border border-sandstone-100 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-[10px] font-bold uppercase text-sandstone-400 tracking-widest mb-1">Diagnóstico do Laudo</h3>
                    <p className="text-lg font-serif font-bold text-charcoal italic leading-snug">
                      {selectedPatient.report?.diagnosis.includes(' - ') ? selectedPatient.report.diagnosis.split(' - ')[0] : selectedPatient.report?.diagnosis}
                    </p>
                  </div>
                  <div className="text-right">
                    <h3 className="text-[10px] font-bold uppercase text-sandstone-400 tracking-widest mb-1">Responsável Laudo</h3>
                    <p className="text-xs font-bold text-cardinal-700 uppercase italic">{selectedPatient.report?.doctorName}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-[10px] font-bold uppercase text-sandstone-400 tracking-widest mb-1">Conduta Sugerida</h3>
                  <p className="text-sm text-sandstone-600 font-medium italic">
                    {selectedPatient.report?.suggestedConduct || (selectedPatient.report?.diagnosis.includes(' - ') ? selectedPatient.report.diagnosis.split(' - ').slice(1).join(' - ') : 'Sem conduta específica sugerida')}
                  </p>
                </div>
              </div>

              {/* Technical Forms */}
              <form onSubmit={handleSubmitReferral} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Scheduling Date (Required for Completion) */}
                  <div className="space-y-2 col-span-2 md:col-span-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-cardinal-700 flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-2" /> Data do Agendamento
                    </label>
                    <input
                      type="date"
                      name="scheduledDate"
                      value={referralForm.scheduledDate}
                      onChange={handleInputChange}
                      required
                      className="w-full bg-cardinal-50/30 border border-cardinal-100 rounded-xl px-4 py-3 text-sm font-bold text-charcoal outline-none focus:ring-2 focus:ring-cardinal-700/10 focus:bg-white transition-all"
                    />
                    <p className="text-[9px] text-cardinal-400 italic">* Este campo finaliza o processo e move o paciente para Resultados.</p>
                  </div>

                  <div className="space-y-2 col-span-2 md:col-span-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-500 flex items-center">
                      <ShieldCheck className="w-3.5 h-3.5 mr-2" /> Unidade de Referência
                    </label>
                    <input
                      type="text"
                      name="specializedService"
                      value={referralForm.specializedService}
                      onChange={handleInputChange}
                      className="input-premium"
                      placeholder="Ex: AME, Santa Casa, etc..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-500 flex items-center">
                      <User className="w-3.5 h-3.5 mr-2" /> Técnico Responsável
                    </label>
                    <input
                      type="text"
                      name="referredBy"
                      value={referralForm.referredBy}
                      onChange={handleInputChange}
                      required
                      className="input-premium"
                      placeholder="Nome do Operador"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-500 flex items-center">
                      <Send className="w-3.5 h-3.5 mr-2" /> Especialidade
                    </label>
                    <select
                      name="specialty"
                      value={referralForm.specialty}
                      onChange={handleInputChange}
                      required
                      className="input-premium"
                    >
                      <option value="">Selecione...</option>
                      <option value="Oftalmologia Geral">Oftalmologia Geral</option>
                      <option value="Retina">Retina & Vítreo</option>
                      <option value="Glaucoma">Glaucoma</option>
                      <option value="Catarata">Catarata</option>
                      <option value="Neuroftalmologia">Neuroftalmologia</option>
                      <option value="Uveíte">Uveíte</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-500 flex items-center">
                    <AlertTriangle className="w-3.5 h-3.5 mr-2" /> Classificação de Prioridade
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'routine', label: 'Rotina', color: 'bg-green-600', text: 'text-green-600' },
                      { id: 'urgent', label: 'Urgente', color: 'bg-orange-600', text: 'text-orange-600' },
                      { id: 'emergency', label: 'Emergência', color: 'bg-red-600', text: 'text-red-600' },
                    ].map(level => (
                      <button
                        key={level.id}
                        type="button"
                        onClick={() => setReferralForm(prev => ({ ...prev, urgency: level.id as any }))}
                        className={`p-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all flex flex-col items-center gap-2 ${referralForm.urgency === level.id
                          ? `${level.text} border-current bg-white shadow-md -translate-y-0.5`
                          : 'bg-sandstone-50/50 border-sandstone-100 text-sandstone-400'
                          }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${referralForm.urgency === level.id ? level.color : 'bg-sandstone-200'}`} />
                        {level.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-500">Observações Logísticas</label>
                  <textarea
                    name="notes"
                    value={referralForm.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="input-premium"
                    placeholder="Detalhes sobre o agendamento ou transporte..."
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-8 py-4 bg-sandstone-100 text-sandstone-500 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-sandstone-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || success}
                    className="flex-[2] bg-cardinal-700 text-white rounded-2xl py-4 font-bold uppercase tracking-widest text-xs shadow-lg shadow-cardinal-700/20 flex items-center justify-center gap-3 hover:-translate-y-1 transition-all"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : success ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Agendado com Sucesso</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        <span>Validar & Concluir Agendamento</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .stagger-load > * {
          animation: fadeInUp 0.6s ease-out forwards;
          opacity: 0;
        }
        .stagger-load > *:nth-child(1) { animation-delay: 0.1s; }
        .stagger-load > *:nth-child(2) { animation-delay: 0.2s; }
        .stagger-load > *:nth-child(3) { animation-delay: 0.3s; }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .input-premium {
          @apply w-full bg-sandstone-50 border border-sandstone-100 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-cardinal-700/5 focus:bg-white focus:border-cardinal-700/20 transition-all shadow-inner placeholder:text-sandstone-300;
        }
      `}</style>
    </div>
  );
}
