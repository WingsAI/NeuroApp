'use client';

import React, { useEffect, useState } from 'react';
import { Search, FileText, User, Calendar, MapPin, Printer, Eye, Image as ImageIcon, X, ShieldCheck, Clock, CheckCircle2, FileCheck, ArrowUpRight } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getPatientsAction } from '@/app/actions/patients';
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

  const loadPatients = async () => {
    const allPatients = await getPatientsAction();
    // Only show patients with completed reports
    const completedPatients = (allPatients as Patient[]).filter(
      (p) => p.status === 'completed' && p.report
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
      (p: Patient) =>
        p.name.toLowerCase().includes(term) ||
        p.cpf.includes(term) ||
        p.report?.doctorName?.toLowerCase().includes(term) ||
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
    <div className="min-h-screen relative overflow-hidden">
      <div className="noise-overlay" />
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="stagger-load space-y-12">
          {/* Header Section */}
          <div className="max-w-2xl">
            <div className="accent-line" />
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal mb-6 leading-[1.1]">
              Consultório de <span className="text-cardinal-700 italic">Resultados</span>
            </h1>
            <p className="text-lg text-sandstone-600 font-medium">
              Repositório centralizado de laudos validados e documentação clínica pericial.
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-2xl group">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-sandstone-400 group-focus-within:text-cardinal-700 transition-colors" />
            <input
              type="text"
              placeholder="Buscar por paciente, documento, médico ou unidade..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="input-premium pl-12 h-14 text-lg shadow-sm"
            />
          </div>

          {/* Results List */}
          {filteredPatients.length === 0 ? (
            <div className="premium-card p-20 text-center bg-sandstone-50/30">
              <FileText className="mx-auto h-16 w-16 text-sandstone-200" />
              <h3 className="text-2xl font-serif font-bold text-charcoal mt-6 mb-2">Nenhum laudo encontrado</h3>
              <p className="text-sandstone-600 font-medium max-w-md mx-auto">
                {searchTerm ? 'Tente ajustar sua busca para localizar o registro desejado.' : 'Não há registros arquivados no banco de dados atualmente.'}
              </p>
            </div>
          ) : (
            <div className="premium-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-sandstone-50/50">
                      <th className="px-8 py-5 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Protocolo
                      </th>
                      <th className="px-8 py-5 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Paciente
                      </th>
                      <th className="px-8 py-5 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Responsável Técnico
                      </th>
                      <th className="px-8 py-5 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Validação
                      </th>
                      <th className="px-8 py-5 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Localidade
                      </th>
                      <th className="px-8 py-5 text-right text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Visualização
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sandstone-100">
                    {filteredPatients.map((patient) => (
                      <tr key={patient.id} className="group hover:bg-cardinal-50/20 transition-all duration-300">
                        <td className="px-8 py-6 text-sm font-bold text-cardinal-700">
                          #{patient.id.slice(-6).toUpperCase()}
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-sandstone-50 rounded-full flex items-center justify-center text-cardinal-700 group-hover:bg-cardinal-700 group-hover:text-white transition-colors duration-500">
                              <User className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-charcoal">{patient.name}</div>
                              <div className="text-[10px] text-sandstone-400 font-bold uppercase tracking-wider">{patient.cpf}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="text-sm font-serif font-bold text-charcoal italic">{patient.report?.doctorName}</div>
                          <div className="text-[10px] text-sandstone-400 flex items-center mt-1 uppercase tracking-tighter">
                            <Clock className="w-3 h-3 mr-1" />
                            Exame: {formatDate(patient.examDate)}
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-100 text-[10px] font-bold uppercase tracking-widest">
                            <CheckCircle2 className="w-3 h-3 mr-1.5" />
                            Concluído em {formatDate(patient.report?.completedAt || '')}
                          </div>
                        </td>
                        <td className="px-8 py-6 text-sm font-medium text-sandstone-600">
                          {patient.location.trim().startsWith('Tauá') ? 'Tauá-Ceará' : patient.location}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button
                            onClick={() => handleViewReport(patient)}
                            className="inline-flex items-center px-5 py-2.5 bg-white text-cardinal-700 text-xs font-bold uppercase tracking-widest rounded-lg border border-cardinal-200 hover:bg-cardinal-700 hover:text-white shadow-sm hover:shadow-lg transition-all group-hover:-translate-y-0.5"
                          >
                            <Eye className="h-4 w-4 mr-2" />
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
        </div>
      </main>

      {/* Report View Modal */}
      {showModal && selectedPatient && selectedPatient.report && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
          <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm transition-opacity" onClick={closeModal} />

          <div className="relative bg-white w-full max-w-5xl max-h-[95vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col stagger-load">
            {/* Modal Header */}
            <div className="px-8 py-6 bg-sandstone-50 border-b border-sandstone-100 flex items-center justify-between no-print">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-cardinal-700 rounded-xl text-white shadow-lg">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif font-bold text-charcoal">Dossiê de Laudo</h2>
                  <p className="text-sm font-medium text-sandstone-500 uppercase tracking-widest">Certificação # {selectedPatient.report.id.slice(-8).toUpperCase()}</p>
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handlePrint}
                  className="p-3 bg-white text-sandstone-600 hover:text-cardinal-700 border border-sandstone-200 rounded-xl hover:shadow-md transition-all flex items-center space-x-2"
                >
                  <Printer className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-widest px-2">Imprimir</span>
                </button>
                <button
                  onClick={closeModal}
                  className="p-3 bg-white text-sandstone-400 hover:text-charcoal border border-sandstone-200 rounded-xl hover:shadow-md transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div className="flex-1 overflow-y-auto p-12 bg-white print:p-0">
              <div className="max-w-4xl mx-auto space-y-12">
                {/* Document Subheader */}
                <div className="text-center space-y-4 border-b-2 border-cardinal-700 pb-8">
                  <div className="text-cardinal-700 font-serif text-3xl font-bold uppercase tracking-[0.2em]">NeuroApp</div>
                  <h1 className="text-2xl font-serif font-bold text-charcoal">CERTIFICADO DE ANÁLISE NEUROFTALMOLÓGICA</h1>
                  <div className="flex items-center justify-center space-x-6 text-[10px] font-bold uppercase tracking-widest text-sandstone-400">
                    <span className="flex items-center"><ShieldCheck className="w-3 h-3 mr-1 text-cardinal-700" /> Protocolo Seguro</span>
                    <span className="flex items-center"><FileCheck className="w-3 h-3 mr-1 text-cardinal-700" /> Verificado por Especialista</span>
                  </div>
                </div>

                {/* Patient & Exam Metadata */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="premium-card p-8 bg-sandstone-50/50 border-none">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-cardinal-800 mb-6 flex items-center">
                      <User className="w-4 h-4 mr-2" /> Identificação do Paciente
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end border-b border-sandstone-200 pb-2">
                        <span className="text-[10px] uppercase font-bold text-sandstone-400">Nome</span>
                        <span className="text-sm font-serif font-bold text-charcoal">{selectedPatient.name}</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-sandstone-200 pb-2">
                        <span className="text-[10px] uppercase font-bold text-sandstone-400">Documento/CPF</span>
                        <span className="text-sm font-medium text-charcoal">{selectedPatient.cpf}</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-sandstone-200 pb-2">
                        <span className="text-[10px] uppercase font-bold text-sandstone-400">Nascimento</span>
                        <span className="text-sm font-medium text-charcoal">{formatDate(selectedPatient.birthDate)}</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-sandstone-200 pb-2">
                        <span className="text-[10px] uppercase font-bold text-sandstone-400">Idade</span>
                        <span className="text-sm font-medium text-charcoal">{new Date().getFullYear() - new Date(selectedPatient.birthDate).getFullYear()} anos</span>
                      </div>
                    </div>
                  </div>

                  <div className="premium-card p-8 bg-sandstone-50/50 border-none">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-cardinal-800 mb-6 flex items-center">
                      <Calendar className="w-4 h-4 mr-2" /> Dados do Procedimento
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end border-b border-sandstone-200 pb-2">
                        <span className="text-[10px] uppercase font-bold text-sandstone-400">Data Exame</span>
                        <span className="text-sm font-serif font-bold text-charcoal">{formatDate(selectedPatient.examDate)}</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-sandstone-200 pb-2">
                        <span className="text-[10px] uppercase font-bold text-sandstone-400">Unidade</span>
                        <span className="text-sm font-medium text-charcoal flex items-center"><MapPin className="w-3 h-3 mr-1" /> {selectedPatient.location.trim().startsWith('Tauá') ? 'Tauá-Ceará' : selectedPatient.location}</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-sandstone-200 pb-2">
                        <span className="text-[10px] uppercase font-bold text-sandstone-400">Técnico</span>
                        <span className="text-sm font-medium text-charcoal">{selectedPatient.technicianName}</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-sandstone-200 pb-2">
                        <span className="text-[10px] uppercase font-bold text-sandstone-400">Emissão</span>
                        <span className="text-sm font-medium text-charcoal">{formatDateTime(selectedPatient.report.completedAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Referral Info (if exists) */}
                {selectedPatient.referral && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="premium-card p-8 bg-cardinal-50/30 border-cardinal-100">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-cardinal-800 mb-6 flex items-center">
                        <ArrowUpRight className="w-4 h-4 mr-2" /> Encaminhamento & Referência
                      </h3>
                      <div className="grid grid-cols-1 gap-6">
                        <div className="flex justify-between items-end border-b border-sandstone-200 pb-2">
                          <span className="text-[10px] uppercase font-bold text-sandstone-400">Especialidade</span>
                          <span className="text-sm font-bold text-charcoal">{selectedPatient.referral.specialty}</span>
                        </div>
                        <div className="flex justify-between items-end border-b border-sandstone-200 pb-2">
                          <span className="text-[10px] uppercase font-bold text-sandstone-400">Priorização</span>
                          <span className="text-sm font-bold text-cardinal-700">
                            {selectedPatient.referral.urgency === 'emergency' ? '🔴 Emergência' :
                              selectedPatient.referral.urgency === 'urgent' ? '🟠 Urgente' : '🟢 Rotina'}
                          </span>
                        </div>
                        <div className="flex justify-between items-end border-b border-sandstone-200 pb-2">
                          <span className="text-[10px] uppercase font-bold text-sandstone-400">Data</span>
                          <span className="text-sm font-medium text-charcoal">{formatDate(selectedPatient.referral.referralDate)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="premium-card p-8 bg-blue-50/30 border-blue-100">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-blue-800 mb-6 flex items-center">
                        <ShieldCheck className="w-4 h-4 mr-2" /> Seguimento & Desfecho
                      </h3>
                      <div className="grid grid-cols-1 gap-6">
                        <div className="flex justify-between items-end border-b border-blue-200 pb-2">
                          <span className="text-[10px] uppercase font-bold text-blue-400">Serviço de Atenção</span>
                          <span className="text-sm font-bold text-charcoal">{selectedPatient.referral.specializedService || 'Aguardando definição'}</span>
                        </div>
                        <div className="flex justify-between items-end border-b border-blue-200 pb-2">
                          <span className="text-[10px] uppercase font-bold text-blue-400">Desfecho Final</span>
                          <span className="text-sm font-bold text-blue-700">{selectedPatient.referral.outcome || 'Em acompanhamento'}</span>
                        </div>
                        <div className="flex justify-between items-end border-b border-blue-200 pb-2">
                          <span className="text-[10px] uppercase font-bold text-blue-400">Data Desfecho</span>
                          <span className="text-sm font-medium text-charcoal">{selectedPatient.referral.outcomeDate ? formatDate(selectedPatient.referral.outcomeDate) : '--/--/----'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Image Catalog */}
                <div className="space-y-6">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-cardinal-800 flex items-center no-print">
                    <ImageIcon className="w-4 h-4 mr-2" /> Acervo Iconográfico do Exame
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {selectedPatient.images.map((image, index) => (
                      <div key={image.id} className="premium-card p-2 group hover:border-cardinal-200 transition-all cursor-pointer overflow-hidden">
                        <div className="aspect-[4/3] rounded-lg overflow-hidden bg-sandstone-100">
                          <img
                            src={image.data}
                            alt={`Bio-imagem ${index + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                            onClick={() => window.open(image.data, '_blank')}
                          />
                        </div>
                        <div className="mt-3 flex justify-between items-center px-2">
                          <span className="text-[10px] font-bold text-sandstone-400 uppercase tracking-widest">Captura {index + 1}</span>
                          <span className="p-1 bg-sandstone-50 rounded-full text-sandstone-300">
                            <Eye className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Report Findings & Diagnosis */}
                <div className="space-y-12 py-12 border-t border-sandstone-100">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    <div className="lg:col-span-1">
                      <h3 className="text-sm font-serif font-bold text-charcoal mb-4 italic">Condições Clínicas</h3>
                      {selectedPatient.report.diagnosticConditions && (
                        Object.entries(selectedPatient.report.diagnosticConditions || {}).some(([k, v]) => v) ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedPatient.report.diagnosticConditions.normal && (
                              <span className="px-3 py-1 bg-green-50 text-green-700 border border-green-100 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                Exame Normal
                              </span>
                            )}
                            {selectedPatient.report.diagnosticConditions.drMild && (
                              <span className="px-3 py-1 bg-cardinal-50 text-cardinal-700 border border-cardinal-100 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                RD Leve
                              </span>
                            )}
                            {selectedPatient.report.diagnosticConditions.drModerate && (
                              <span className="px-3 py-1 bg-cardinal-50 text-cardinal-700 border border-cardinal-100 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                RD Moderada
                              </span>
                            )}
                            {selectedPatient.report.diagnosticConditions.drSevere && (
                              <span className="px-3 py-1 bg-cardinal-50 text-cardinal-700 border border-cardinal-100 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                RD Grave
                              </span>
                            )}
                            {selectedPatient.report.diagnosticConditions.drProliferative && (
                              <span className="px-3 py-1 bg-cardinal-700 text-white border border-cardinal-800 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                RD Proliferativa
                              </span>
                            )}
                            {selectedPatient.report.diagnosticConditions.glaucomaSuspect && (
                              <span className="px-3 py-1 bg-cardinal-50 text-cardinal-700 border border-cardinal-100 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                Suspeita de Glaucoma
                              </span>
                            )}
                            {selectedPatient.report.diagnosticConditions.others && (
                              <span className="px-3 py-1 bg-sandstone-100 text-sandstone-700 border border-sandstone-200 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                Outros
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm font-serif italic text-sandstone-400">Escrutínio oftalmológico sem evidências de neuropatias principais.</span>
                        )
                      )}
                    </div>

                    <div className="lg:col-span-2 space-y-10">
                      <section>
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-sandstone-400 mb-4 divider-after">Achados Clínicos</h4>
                        <div className="space-y-6">
                          {(() => {
                            try {
                              const f = JSON.parse(selectedPatient.report.findings);
                              if (f.od && f.oe) {
                                return (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                      <h5 className="text-[10px] font-bold text-cardinal-700 uppercase tracking-widest border-b border-cardinal-100 pb-2">Olho Direito (OD)</h5>
                                      <div className="space-y-3">
                                        <div className="p-3 bg-sandstone-50 rounded-lg">
                                          <p className="text-[9px] font-bold text-sandstone-400 uppercase mb-1">Córnea / Nervo</p>
                                          <p className="text-sm font-serif text-charcoal">{f.od.opticNerve || 'Sem notas'}</p>
                                        </div>
                                        <div className="p-3 bg-sandstone-50 rounded-lg">
                                          <p className="text-[9px] font-bold text-sandstone-400 uppercase mb-1">Retina / Mácula</p>
                                          <p className="text-sm font-serif text-charcoal">{f.od.retina || 'Sem notas'}</p>
                                        </div>
                                        <div className="p-3 bg-sandstone-50 rounded-lg">
                                          <p className="text-[9px] font-bold text-sandstone-400 uppercase mb-1">Arcadas / Vasos</p>
                                          <p className="text-sm font-serif text-charcoal">{f.od.vessels || 'Sem notas'}</p>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="space-y-4">
                                      <h5 className="text-[10px] font-bold text-cardinal-700 uppercase tracking-widest border-b border-cardinal-100 pb-2">Olho Esquerdo (OE)</h5>
                                      <div className="space-y-3">
                                        <div className="p-3 bg-sandstone-50 rounded-lg">
                                          <p className="text-[9px] font-bold text-sandstone-400 uppercase mb-1">Córnea / Nervo</p>
                                          <p className="text-sm font-serif text-charcoal">{f.oe.opticNerve || 'Sem notas'}</p>
                                        </div>
                                        <div className="p-3 bg-sandstone-50 rounded-lg">
                                          <p className="text-[9px] font-bold text-sandstone-400 uppercase mb-1">Retina / Mácula</p>
                                          <p className="text-sm font-serif text-charcoal">{f.oe.retina || 'Sem notas'}</p>
                                        </div>
                                        <div className="p-3 bg-sandstone-50 rounded-lg">
                                          <p className="text-[9px] font-bold text-sandstone-400 uppercase mb-1">Arcadas / Vasos</p>
                                          <p className="text-sm font-serif text-charcoal">{f.oe.vessels || 'Sem notas'}</p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                            } catch (e) {
                              return <p className="text-base text-charcoal font-serif leading-relaxed text-justify">{selectedPatient.report.findings}</p>;
                            }
                            return <p className="text-base text-charcoal font-serif leading-relaxed text-justify">{selectedPatient.report.findings}</p>;
                          })()}
                        </div>
                      </section>

                      <section>
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-sandstone-400 mb-4 divider-after">Conclusão Diagnóstica</h4>
                        <div className="p-6 bg-sandstone-50 border-l-4 border-cardinal-700 rounded-r-2xl">
                          <p className="text-lg text-charcoal font-serif font-bold italic leading-relaxed">
                            {selectedPatient.report.diagnosis}
                          </p>
                        </div>
                      </section>

                      <section>
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-sandstone-400 mb-4 divider-after">Conduta Sugerida</h4>
                        <p className="text-sm text-sandstone-600 font-medium leading-relaxed italic">
                          {selectedPatient.report.recommendations}
                        </p>
                      </section>
                    </div>
                  </div>
                </div>

                {/* Signature Block */}
                <div className="pt-16 pb-8 border-t border-sandstone-100 flex flex-col items-center text-center">
                  <div className="text-charcoal font-serif text-xl font-bold mb-1 italic">
                    {selectedPatient.report.doctorName}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-sandstone-400 mb-4">
                    Responsável Médico pela Validação
                  </div>
                  <div className="w-48 h-px bg-sandstone-300 opacity-50 mb-4" />
                  <div className="text-[10px] font-medium text-sandstone-500">
                    Documento assinado digitalmente | {formatDateTime(selectedPatient.report.completedAt)}
                  </div>
                </div>

                {/* Traceability Timeline */}
                <div className="space-y-8 no-print pt-12 border-t border-sandstone-100">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-sandstone-400 flex items-center">
                    <Clock className="w-4 h-4 mr-2" /> Rastreabilidade do Fluxo Operacional
                  </h3>
                  <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-sandstone-100">
                    <TimelineItem
                      title="Registro & Triagem Inicial"
                      date={formatDateTime(selectedPatient.createdAt)}
                      status="Concluído"
                      detail={`Iniciado na Unidade: ${selectedPatient.location.trim().startsWith('Tauá') ? 'Tauá-Ceará' : selectedPatient.location}`}
                    />
                    <TimelineItem
                      title="Análise Neuroftalmológica"
                      date={formatDateTime(selectedPatient.report.completedAt)}
                      status="Concluído"
                      detail={`Validado por: ${selectedPatient.report.doctorName}`}
                    />
                    {selectedPatient.referral && (
                      <TimelineItem
                        title="Encaminhamento para Especialista"
                        date={formatDateTime(selectedPatient.referral.referralDate)}
                        status="Concluído"
                        detail={`Destino: ${selectedPatient.referral.specialty}`}
                      />
                    )}
                    {selectedPatient.referral?.outcome && (
                      <TimelineItem
                        title="Desfecho & Seguimento Final"
                        date={selectedPatient.referral.outcomeDate ? formatDateTime(selectedPatient.referral.outcomeDate) : 'Em processamento'}
                        status="Definido"
                        detail={`Status: ${selectedPatient.referral.outcome}`}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="px-8 py-6 bg-sandstone-50 border-t border-sandstone-100 flex justify-end gap-4 no-print">
              <button
                onClick={closeModal}
                className="px-8 py-3 text-sandstone-400 font-bold uppercase tracking-widest text-[10px] hover:bg-white rounded-xl transition-colors border border-transparent hover:border-sandstone-200"
              >
                Voltar ao Índice
              </button>
              <button
                onClick={handlePrint}
                className="btn-cardinal px-10 py-3 text-xs uppercase tracking-widest font-bold flex items-center space-x-3"
              >
                <Printer className="w-4 h-4" />
                <span>Salvar PDF / Imprimir</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .min-h-screen { min-height: 0 !important; overflow: visible !important; }
          .stagger-load { transform: none !important; opacity: 1 !important; }
          .premium-card { border: 1px solid #e5e7eb !important; box-shadow: none !important; }
        }
        .divider-after {
          position: relative;
          display: flex;
          align-items: center;
        }
        .divider-after::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #e2e8f0;
          margin-left: 1rem;
        }
      `}</style>
    </div>
  );
}

function TimelineItem({ title, date, status, detail }: any) {
  return (
    <div className="relative group">
      <div className="absolute -left-[27px] top-1.5 w-4 h-4 rounded-full bg-white border-4 border-cardinal-700 shadow-sm z-10 group-hover:scale-125 transition-transform" />
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-charcoal uppercase tracking-tight">{title}</p>
          <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100 uppercase tracking-widest">{status}</span>
        </div>
        <p className="text-[10px] font-bold text-sandstone-300 uppercase tracking-[0.2em] mb-2">{date}</p>
        <p className="text-xs font-medium text-sandstone-500 italic leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}
