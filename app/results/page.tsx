'use client';

import React, { useEffect, useState } from 'react';
import { Search, FileText, User, Calendar, MapPin, Printer, Eye, Image as ImageIcon, X, ShieldCheck, Clock, CheckCircle2, FileCheck, ArrowUpRight, AlertTriangle, UploadCloud, Loader2, Pencil, Download } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getPatientsAction } from '@/app/actions/patients';
import { syncReportsToDriveAction } from '@/app/actions/drive';
import { Patient } from '@/types';
import { useRouter } from 'next/navigation';

import html2canvas from 'html2canvas';

// Helper component for high-fidelity printing/exporting
function ReportPrintTemplate({ patient }: { patient: any }) {
  if (!patient || !patient.report) return null;

  const formatDate = (dateString: string) => {
    if (!dateString) return '---';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR');
    } catch (e) { return dateString; }
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '---';
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return dateString; }
  };

  const formatCPF = (cpf: string) => {
    if (!cpf) return '---';
    const numeric = cpf.replace(/\D/g, '');
    if (numeric.length !== 11) return cpf;
    return numeric.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  return (
    <div className="bg-white w-[1000px] mx-auto">
      {/* PAGE 1: Identificação e Imagens */}
      <div id="report-page-1" className="p-16 min-h-[1400px] space-y-12 border-b border-dashed border-sandstone-200 print:border-0">
        {/* Document Subheader */}
        <div className="text-center space-y-4 border-b-2 border-cardinal-700 pb-8">
          <h1 className="text-3xl font-serif font-bold text-charcoal uppercase">Relatório Oftalmológico</h1>
          <div className="flex items-center justify-center space-x-6 text-[11px] font-bold uppercase tracking-widest text-sandstone-400">
            <span className="flex items-center"><ShieldCheck className="w-3.5 h-3.5 mr-1 text-cardinal-700" /> Protocolo Seguro</span>
            <span className="flex items-center"><FileCheck className="w-3.5 h-3.5 mr-1 text-cardinal-700" /> Verificado por Especialista</span>
          </div>
        </div>

        {/* Patient & Exam Metadata Summary Block */}
        <div className="bg-sandstone-50/50 p-8 rounded-2xl border border-sandstone-100 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-10 gap-y-6 text-[11px]">
            <div className="flex flex-col border-b border-sandstone-200 pb-2">
              <span className="uppercase font-bold text-sandstone-400 mb-1">Paciente</span>
              <span className="text-base font-serif font-bold text-charcoal leading-tight">{patient.name}</span>
            </div>
            <div className="flex flex-col border-b border-sandstone-200 pb-2">
              <span className="uppercase font-bold text-sandstone-400 mb-1">Documento / CPF</span>
              <span className="text-xs font-bold text-charcoal">{formatCPF(patient.cpf)}</span>
            </div>
            <div className="flex flex-col border-b border-sandstone-200 pb-2">
              <span className="uppercase font-bold text-sandstone-400 mb-1">Nascimento / Idade</span>
              <span className="text-xs font-bold text-charcoal">
                {formatDate(patient.birthDate)} ({new Date().getFullYear() - new Date(patient.birthDate).getFullYear()} anos)
              </span>
            </div>
            <div className="flex flex-col border-b border-sandstone-200 pb-2">
              <span className="uppercase font-bold text-sandstone-400 mb-1">Data do Exame</span>
              <span className="text-xs font-bold text-charcoal">{formatDate(patient.examDate)}</span>
            </div>
            <div className="flex flex-col border-b border-sandstone-200 pb-2">
              <span className="uppercase font-bold text-sandstone-400 mb-1">Unidade / Local</span>
              <span className="text-xs font-bold text-charcoal flex items-center">
                <MapPin className="w-3.5 h-3.5 mr-1.5" />
                {patient.location.trim().startsWith('Tauá') ? 'Tauá-Ceará' : patient.location}
              </span>
            </div>
            <div className="flex flex-col border-b border-sandstone-200 pb-2">
              <span className="uppercase font-bold text-sandstone-400 mb-1">Validação Médica</span>
              <span className="text-xs font-serif font-bold italic text-charcoal">{formatDateTime(patient.report.completedAt)}</span>
            </div>
          </div>
        </div>

        {/* Image Catalog */}
        <div className="space-y-6">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-cardinal-800 flex items-center">
            <ImageIcon className="w-4 h-4 mr-2.5" /> Acervo Iconográfico Selecionado
          </h3>
          <div className="grid grid-cols-2 gap-8 max-w-4xl mx-auto">
            {patient.report.selectedImages?.od ? (
              <div className="premium-card p-3 overflow-hidden bg-sandstone-50/30">
                <div className="aspect-[4/3] rounded-xl overflow-hidden bg-sandstone-100">
                  <img
                    src={patient.images.find(img => img.id === patient.report?.selectedImages?.od)?.data || ''}
                    alt="Olho Direito"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="mt-4 flex justify-center items-center">
                  <span className="text-[11px] font-bold text-sandstone-400 uppercase tracking-[0.2em]">Olho Direito (OD)</span>
                </div>
              </div>
            ) : null}
            {patient.report.selectedImages?.oe ? (
              <div className="premium-card p-3 overflow-hidden bg-sandstone-50/30">
                <div className="aspect-[4/3] rounded-xl overflow-hidden bg-sandstone-100">
                  <img
                    src={patient.images.find(img => img.id === patient.report?.selectedImages?.oe)?.data || ''}
                    alt="Olho Esquerdo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="mt-4 flex justify-center items-center">
                  <span className="text-[11px] font-bold text-sandstone-400 uppercase tracking-[0.2em]">Olho Esquerdo (OE)</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer da Página 1 */}
        <div className="pt-20 text-center text-[10px] text-sandstone-300 uppercase tracking-[0.3em]">
          Continua na próxima página
        </div>
      </div>

      {/* PAGE 2: Conclusões e Assinatura */}
      <div id="report-page-2" className="p-16 min-h-[1400px] space-y-12 print:break-before-page">
        {/* Report Findings & Diagnosis */}
        <div className="space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-sandstone-400 mb-6 underline decoration-cardinal-700 decoration-2 underline-offset-8">Condições Clínicas Detectadas</h3>
              {patient.report.diagnosticConditions && (
                <div className="flex flex-wrap gap-2.5">
                  {Object.entries(patient.report.diagnosticConditions || {}).map(([key, value]) => {
                    if (!value) return null;
                    const labels: any = {
                      normal: 'Exame Normal',
                      drMild: 'RD Leve',
                      drModerate: 'RD Moderada',
                      drSevere: 'RD Grave',
                      drProliferative: 'RD Proliferativa',
                      glaucomaSuspect: 'Suspeita de Glaucoma',
                      hrMild: 'RH Leve',
                      hrModerate: 'RH Moderada',
                      hrSevere: 'RH Grave',
                      reconvocarUrgente: 'Re-convocar Prioridade',
                      reconvocar: 'Re-convocar',
                      encaminhar: 'Encaminhar',
                      tumor: 'Tumor / Massa',
                      others: 'Outros'
                    };
                    const isRed = ['drMild', 'drModerate', 'drSevere', 'drProliferative', 'glaucomaSuspect', 'tumor'].includes(key);
                    const isOrange = ['reconvocar', 'reconvocarUrgente'].includes(key);
                    const isGreen = key === 'normal';

                    return (
                      <span key={key} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm border ${isRed ? 'bg-cardinal-50 text-cardinal-700 border-cardinal-100' :
                        isOrange ? 'bg-orange-50 text-orange-700 border-orange-100' :
                          isGreen ? 'bg-green-50 text-green-700 border-green-100' :
                            'bg-sandstone-100 text-sandstone-700 border-sandstone-200'
                        }`}>
                        {labels[key] || key}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-3 space-y-12">
              <section>
                <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-sandstone-400 mb-6 flex items-center">
                  <span>Achados de Biomicroscopia de Fundo</span>
                  <div className="flex-1 h-px bg-sandstone-100 ml-4" />
                </h4>
                <div className="space-y-8">
                  {(() => {
                    try {
                      const f = JSON.parse(patient.report?.findings || '{}');
                      if (f.od && f.oe) {
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                            <div className="space-y-4">
                              <h5 className="text-[10px] font-bold text-cardinal-700 uppercase tracking-widest border-b border-cardinal-100 pb-1.5">Olho Direito (OD)</h5>
                              <div className="space-y-3">
                                {['opticNerve', 'retina', 'vessels'].map(key => (
                                  <div key={key} className="flex items-start space-x-4 p-3 bg-sandstone-50/50 rounded-xl border border-sandstone-100">
                                    <p className="text-[9px] font-bold text-sandstone-400 uppercase w-16 mt-1">{key === 'opticNerve' ? 'Nervo' : key === 'vessels' ? 'Vasos' : 'Retina'}</p>
                                    <p className="text-xs font-serif text-charcoal leading-relaxed">{(f.od as any)[key] || 'Sem notas'}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-4">
                              <h5 className="text-[10px] font-bold text-cardinal-700 uppercase tracking-widest border-b border-cardinal-100 pb-1.5">Olho Esquerdo (OE)</h5>
                              <div className="space-y-3">
                                {['opticNerve', 'retina', 'vessels'].map(key => (
                                  <div key={key} className="flex items-start space-x-4 p-3 bg-sandstone-50/50 rounded-xl border border-sandstone-100">
                                    <p className="text-[9px] font-bold text-sandstone-400 uppercase w-16 mt-1">{key === 'opticNerve' ? 'Nervo' : key === 'vessels' ? 'Vasos' : 'Retina'}</p>
                                    <p className="text-xs font-serif text-charcoal leading-relaxed">{(f.oe as any)[key] || 'Sem notas'}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      }
                    } catch (e) { }
                    return <p className="text-base text-charcoal font-serif leading-relaxed text-justify">{patient.report?.findings}</p>;
                  })()}
                </div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <section>
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-sandstone-400 mb-6 flex items-center">
                    <span>Conclusão Diagnóstica</span>
                  </h4>
                  <div className="p-8 bg-sandstone-50 border-l-8 border-cardinal-700 rounded-r-3xl h-full">
                    <p className="text-xl text-charcoal font-serif font-bold italic leading-relaxed text-justify">
                      {patient.report.diagnosis || 'Sem diagnóstico especificado.'}
                    </p>
                  </div>
                </section>

                <section>
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-sandstone-400 mb-6 flex items-center">
                    <span>Conduta Sugerida</span>
                  </h4>
                  <div className="p-6 bg-sandstone-50/50 rounded-2xl border border-sandstone-100 h-full">
                    <p className="text-base text-sandstone-600 font-serif leading-relaxed italic text-justify">
                      {patient.report.suggestedConduct || patient.report.recommendations || 'Manter acompanhamento periódico.'}
                    </p>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>

        {/* Signature Block */}
        <div className="pt-20 pb-12 border-t border-sandstone-100 flex flex-col items-center text-center">
          <div className="text-charcoal font-serif text-3xl font-bold mb-2 italic">
            {patient.report.doctorName}
          </div>
          <div className="text-sm font-bold text-sandstone-500 uppercase tracking-[0.4em] mb-4">
            {patient.report.doctorCRM || 'CRM-SP 177.943'}
          </div>
          <div className="w-64 h-px bg-sandstone-200 mb-6" />
          <div className="text-[11px] font-medium text-sandstone-400">
            Documento assinado digitalmente • {formatDateTime(patient.report.completedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Results() {
  const [patients, setPatients] = useState<any[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'completed' | 're_exam' | 'urgent'>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ count?: number, message?: string } | null>(null);
  const [renderPatient, setRenderPatient] = useState<any | null>(null);
  const [exportProgress, setExportProgress] = useState<{ current: number, total: number } | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadPatients();
  }, []);

  useEffect(() => {
    filterPatients();
  }, [searchTerm, patients, filterTab]);

  const [isExporting, setIsExporting] = useState(false);

  const counts = {
    all: patients.length,
    completed: patients.filter(p => {
      try {
        const f = JSON.parse(p.report?.findings || '{}');
        return f.od?.quality === 'satisfactory' && f.oe?.quality === 'satisfactory';
      } catch (e) { return true; }
    }).length,
    re_exam: patients.filter(p => {
      try {
        const f = JSON.parse(p.report?.findings || '{}');
        return (f.od?.quality === 'unsatisfactory' || f.oe?.quality === 'unsatisfactory') && f.od?.quality !== 'impossible' && f.oe?.quality !== 'impossible';
      } catch (e) { return false; }
    }).length,
    urgent: patients.filter(p => {
      try {
        const f = JSON.parse(p.report?.findings || '{}');
        return f.od?.quality === 'impossible' || f.oe?.quality === 'impossible';
      } catch (e) { return false; }
    }).length
  };

  const getBase64Image = async (url: string): Promise<string> => {
    if (url.startsWith('data:')) return url;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return '';
    }
  };

  const exportAllFilteredPDFs = async () => {
    if (filteredPatients.length === 0) return;
    setIsExporting(true);
    setExportProgress({ current: 0, total: filteredPatients.length });
    try {
      const { jsPDF } = await import('jspdf');
      const JSZip = (await import('jszip')).default || (await import('jszip'));
      const fileSaver = await import('file-saver');
      const saveAs = fileSaver.saveAs || fileSaver.default?.saveAs || fileSaver.default;

      const zip = new JSZip();
      let count = 0;

      for (const patient of filteredPatients) {
        if (!patient.report) {
          count++;
          setExportProgress({ current: count, total: filteredPatients.length });
          continue;
        }

        // Set patient to be rendered in the hidden capture area
        setRenderPatient(patient);

        // Wait for rendering and images to load
        await new Promise(resolve => setTimeout(resolve, 1200));

        const page1 = document.getElementById('report-page-1');
        const page2 = document.getElementById('report-page-2');

        if (!page1 || !page2) {
          count++;
          setExportProgress({ current: count, total: filteredPatients.length });
          continue;
        }

        const doc = new jsPDF('p', 'mm', 'a4');

        // Page 1
        const canvas1 = await html2canvas(page1, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: 1000,
          windowWidth: 1000
        } as any);
        const imgData1 = canvas1.toDataURL('image/jpeg', 0.95);
        doc.addImage(imgData1, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');

        // Page 2
        doc.addPage();
        const canvas2 = await html2canvas(page2, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: 1000,
          windowWidth: 1000
        } as any);
        const imgData2 = canvas2.toDataURL('image/jpeg', 0.95);
        doc.addImage(imgData2, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');

        const pdfBlob = doc.output('blob');
        const fileName = `${patient.name.replace(/\s+/g, '_')}_laudo.pdf`;
        zip.file(fileName, pdfBlob);

        count++;
        setExportProgress({ current: count, total: filteredPatients.length });
      }

      setRenderPatient(null);
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `Laudos_NeuroApp_${new Date().toISOString().split('T')[0]}.zip`);
    } catch (error) {
      console.error('Erro na exportação:', error);
      alert('Erro ao gerar os PDFs. Por favor, tente novamente.');
    } finally {
      setIsExporting(false);
      setRenderPatient(null);
      setExportProgress(null);
    }
  };


  const loadPatients = async () => {
    const allPatients = await getPatientsAction() as any[];

    // In the new model, we want to find EXAMS that are completed.
    // We flatten the list so each row in this table is a visit (Exam).
    const completedResults: any[] = [];

    allPatients.forEach(patient => {
      patient.exams.forEach((exam: any) => {
        if (exam.status === 'completed' && exam.report) {
          completedResults.push({
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

    setPatients(completedResults);
  };

  const filterPatients = () => {
    let filtered = patients;

    // Filter by Tab
    if (filterTab === 'completed') {
      filtered = filtered.filter(p => {
        try {
          const f = JSON.parse(p.report?.findings || '{}');
          return f.od?.quality === 'satisfactory' && f.oe?.quality === 'satisfactory';
        } catch (e) { return true; }
      });
    } else if (filterTab === 're_exam') {
      filtered = filtered.filter(p => {
        try {
          const f = JSON.parse(p.report?.findings || '{}');
          return (f.od?.quality === 'unsatisfactory' || f.oe?.quality === 'unsatisfactory') && f.od?.quality !== 'impossible' && f.oe?.quality !== 'impossible';
        } catch (e) { return false; }
      });
    } else if (filterTab === 'urgent') {
      filtered = filtered.filter(p => {
        try {
          const f = JSON.parse(p.report?.findings || '{}');
          return f.od?.quality === 'impossible' || f.oe?.quality === 'impossible';
        } catch (e) { return false; }
      });
    }

    // Filter by Search Term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p: any) =>
          p.name.toLowerCase().includes(term) ||
          (p.cpf && p.cpf.includes(term)) ||
          p.report?.doctorName?.toLowerCase().includes(term) ||
          p.location.toLowerCase().includes(term)
      );
    }

    setFilteredPatients(filtered);
  };

  const handleViewReport = (patient: any) => {
    setSelectedPatient(patient);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatient(null);
  };

  const formatCPF = (cpf: string) => {
    if (!cpf || cpf.startsWith('AUTO-') || cpf.startsWith('CONFLICT-') || cpf === 'PENDENTE') {
      return 'Não-Informado';
    }
    return cpf;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSyncToDrive = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const result = await syncReportsToDriveAction();
      if (result.success) {
        setSyncStatus({ count: result.count, message: result.message });
        loadPatients(); // Refresh to update synced status if needed
      } else {
        alert('Erro na sincronização: ' + result.error);
      }
    } catch (error) {
      alert('Erro ao processar sincronização.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatus(null), 5000);
    }
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

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Search Bar */}
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-sandstone-400 group-focus-within:text-cardinal-700 transition-colors" />
              <input
                type="text"
                placeholder="Buscar por paciente, documento, médico ou unidade..."
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                className="input-premium pl-12 h-14 text-lg shadow-sm w-full"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex p-1.5 bg-sandstone-100 rounded-2xl w-fit">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center space-x-2 ${filterTab === 'all' ? 'bg-white text-charcoal shadow-sm' : 'text-sandstone-400 hover:text-sandstone-600'}`}
              >
                <span>Todos</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] ${filterTab === 'all' ? 'bg-charcoal text-white' : 'bg-sandstone-200 text-sandstone-500'}`}>{counts.all}</span>
              </button>
              <button
                onClick={() => setFilterTab('completed')}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center space-x-2 ${filterTab === 'completed' ? 'bg-white text-green-700 shadow-sm' : 'text-sandstone-400 hover:text-sandstone-600'}`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Concluído</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] ${filterTab === 'completed' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-600'}`}>{counts.completed}</span>
              </button>
              <button
                onClick={() => setFilterTab('re_exam')}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center space-x-2 ${filterTab === 're_exam' ? 'bg-white text-cardinal-700 shadow-sm' : 'text-sandstone-400 hover:text-sandstone-600'}`}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Re-exame</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] ${filterTab === 're_exam' ? 'bg-cardinal-700 text-white' : 'bg-cardinal-100 text-cardinal-600'}`}>{counts.re_exam}</span>
              </button>
              <button
                onClick={() => setFilterTab('urgent')}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center space-x-2 ${filterTab === 'urgent' ? 'bg-white text-charcoal shadow-sm' : 'text-sandstone-400 hover:text-sandstone-600'}`}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Urgente</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] ${filterTab === 'urgent' ? 'bg-charcoal text-white' : 'bg-charcoal-50 text-charcoal'}`}>{counts.urgent}</span>
              </button>
            </div>

            <div className="flex flex-col items-end gap-3">
              <button
                onClick={exportAllFilteredPDFs}
                disabled={isExporting || filteredPatients.length === 0}
                className={`flex items-center space-x-3 px-6 py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg ${isExporting
                  ? 'bg-sandstone-100 text-sandstone-400 cursor-not-allowed'
                  : 'bg-green-700 text-white hover:bg-green-800 hover:-translate-y-1 shadow-green-900/10'
                  }`}
              >
                {isExporting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                <span>{isExporting ? 'Processando...' : `Exportar Todos (${filteredPatients.length})`}</span>
              </button>

              {process.env.NEXT_PUBLIC_ENABLE_DRIVE_SYNC === 'true' && (
                <>
                  <button
                    onClick={handleSyncToDrive}
                    disabled={isSyncing}
                    className={`flex items-center space-x-3 px-6 py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg ${isSyncing
                      ? 'bg-sandstone-100 text-sandstone-400 cursor-not-allowed'
                      : 'bg-charcoal text-white hover:bg-cardinal-700 hover:-translate-y-1 shadow-charcoal/20'
                      }`}
                  >
                    {isSyncing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <UploadCloud className="w-5 h-5" />
                    )}
                    <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Drive'}</span>
                  </button>
                  {syncStatus && (
                    <div className="text-[10px] font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-100 animate-pulse">
                      {syncStatus.message}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Progress Bar for Export */}
          {exportProgress && (
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-sandstone-200 animate-in fade-in slide-in-from-top-4 duration-500 mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-100 rounded-lg text-green-700 animate-pulse">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-charcoal">Exportação em Massa de PDFs</h3>
                    <p className="text-[10px] font-medium text-sandstone-500 uppercase tracking-widest">
                      Processando alta-fidelidade: {exportProgress.current} de {exportProgress.total}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-serif font-bold italic text-green-700">
                  {Math.round((exportProgress.current / exportProgress.total) * 100)}%
                </span>
              </div>
              <div className="w-full h-3 bg-sandstone-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600 transition-all duration-500 ease-out"
                  style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                />
              </div>
              <p className="mt-4 text-[10px] text-center text-sandstone-400 font-medium">
                Por favor, não feche esta aba. A renderização é feita no seu navegador para garantir a qualidade técnica.
              </p>
            </div>
          )}

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
                              <div className="text-[10px] text-sandstone-400 font-bold uppercase tracking-wider">{formatCPF(patient.cpf)}</div>
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
                          {(() => {
                            try {
                              const f = JSON.parse(patient.report?.findings || '{}');
                              const isUnsatisfactory = f.od?.quality === 'unsatisfactory' || f.oe?.quality === 'unsatisfactory';
                              const isImpossible = f.od?.quality === 'impossible' || f.oe?.quality === 'impossible';

                              if (isImpossible) {
                                return (
                                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-100 text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                    <AlertTriangle className="w-3 h-3 mr-1.5" />
                                    Re-exame Urgente
                                  </div>
                                );
                              }

                              if (isUnsatisfactory) {
                                return (
                                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-100 text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                    <AlertTriangle className="w-3 h-3 mr-1.5" />
                                    Re-exame Necessário
                                  </div>
                                );
                              }
                            } catch (e) { }
                            return (
                              <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-100 text-[10px] font-bold uppercase tracking-widest">
                                <CheckCircle2 className="w-3 h-3 mr-1.5" />
                                Concluído em {formatDate(patient.report?.completedAt || '')}
                              </div>
                            );
                          })()}
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
      </main >

      {/* Report View Modal */}
      {
        showModal && selectedPatient && selectedPatient.report && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm transition-opacity" onClick={closeModal} />

            <div className="relative bg-white w-full max-w-5xl max-h-[95vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col stagger-load print-area">
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
                    onClick={() => router.push(`/medical?id=${selectedPatient.id}`)}
                    className="p-3 bg-white text-sandstone-600 hover:text-blue-700 border border-sandstone-200 rounded-xl hover:shadow-md transition-all flex items-center space-x-2"
                  >
                    <Pencil className="h-5 w-5" />
                    <span className="text-xs font-bold uppercase tracking-widest px-2">Editar Laudo</span>
                  </button>
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
                    <h1 className="text-2xl font-serif font-bold text-charcoal uppercase">Relatório Oftalmológico</h1>
                    <div className="flex items-center justify-center space-x-6 text-[10px] font-bold uppercase tracking-widest text-sandstone-400">
                      <span className="flex items-center"><ShieldCheck className="w-3 h-3 mr-1 text-cardinal-700" /> Protocolo Seguro</span>
                      <span className="flex items-center"><FileCheck className="w-3 h-3 mr-1 text-cardinal-700" /> Verificado por Especialista</span>
                    </div>
                  </div>

                  {/* Patient & Exam Metadata Summary Block */}
                  <div className="bg-sandstone-50/50 p-6 rounded-xl border border-sandstone-100 shadow-sm print:p-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-4 text-[10px]">
                      <div className="flex flex-col border-b border-sandstone-200 pb-1 h-full">
                        <span className="uppercase font-bold text-sandstone-400 mb-0.5">Paciente</span>
                        <span className="text-sm font-serif font-bold text-charcoal leading-tight break-words">{selectedPatient.name}</span>
                      </div>
                      <div className="flex flex-col border-b border-sandstone-200 pb-1">
                        <span className="uppercase font-bold text-sandstone-400 mb-0.5">Documento / CPF</span>
                        <span className="text-xs font-bold text-charcoal">{formatCPF(selectedPatient.cpf)}</span>
                      </div>
                      <div className="flex flex-col border-b border-sandstone-200 pb-1">
                        <span className="uppercase font-bold text-sandstone-400 mb-0.5">Nascimento / Idade</span>
                        <span className="text-xs font-bold text-charcoal">
                          {formatDate(selectedPatient.birthDate)} ({new Date().getFullYear() - new Date(selectedPatient.birthDate).getFullYear()} anos)
                        </span>
                      </div>
                      <div className="flex flex-col border-b border-sandstone-200 pb-1">
                        <span className="uppercase font-bold text-sandstone-400 mb-0.5">Data do Exame</span>
                        <span className="text-xs font-bold text-charcoal">{formatDate(selectedPatient.examDate)}</span>
                      </div>
                      <div className="flex flex-col border-b border-sandstone-200 pb-1">
                        <span className="uppercase font-bold text-sandstone-400 mb-0.5">Unidade / Local</span>
                        <span className="text-xs font-bold text-charcoal flex items-center">
                          <MapPin className="w-3 h-3 mr-1" />
                          {selectedPatient.location.trim().startsWith('Tauá') ? 'Tauá-Ceará' : selectedPatient.location}
                        </span>
                      </div>
                      <div className="flex flex-col border-b border-sandstone-200 pb-1">
                        <span className="uppercase font-bold text-sandstone-400 mb-0.5">Validação Médica</span>
                        <span className="text-xs font-serif font-bold italic text-charcoal">{formatDateTime(selectedPatient.report.completedAt)}</span>
                      </div>
                      {selectedPatient.underlyingDiseases && Object.values(selectedPatient.underlyingDiseases).some(v => v === true) && (
                        <div className="flex flex-col border-b border-sandstone-200 pb-1 lg:col-span-2">
                          <span className="uppercase font-bold text-sandstone-400 mb-0.5">Histórico / Comorbidades</span>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(selectedPatient.underlyingDiseases)
                              .filter(([_, v]) => v === true)
                              .map(([key]) => (
                                <span key={key} className="text-[9px] font-bold text-cardinal-700 bg-cardinal-50 px-1.5 py-0.5 rounded border border-cardinal-100 uppercase italic">
                                  {key === 'hypertension' ? 'Hipertensão' :
                                    key === 'diabetes' ? 'Diabetes' :
                                      key === 'cholesterol' ? 'Colesterol' :
                                        key === 'smoker' ? 'Tabagismo' : key}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
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
                  <div className="space-y-4 print:space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-cardinal-800 flex items-center no-print">
                      <ImageIcon className="w-4 h-4 mr-2" /> Acervo Iconográfico Selecionado
                    </h3>
                    <div className="grid grid-cols-2 gap-4 max-w-3xl mx-auto print:max-w-2xl">
                      {selectedPatient.report.selectedImages?.od ? (
                        <div className="premium-card p-2 group hover:border-cardinal-200 transition-all cursor-pointer overflow-hidden">
                          <div className="aspect-[4/3] rounded-lg overflow-hidden bg-sandstone-100">
                            <img
                              src={selectedPatient.images.find(img => img.id === selectedPatient.report?.selectedImages?.od)?.data || ''}
                              alt="Olho Direito"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                              onClick={() => {
                                const url = selectedPatient.images.find(img => img.id === selectedPatient.report?.selectedImages?.od)?.data;
                                if (url) window.open(url, '_blank');
                              }}
                            />
                          </div>
                          <div className="mt-3 flex justify-between items-center px-2">
                            <span className="text-[10px] font-bold text-sandstone-400 uppercase tracking-widest">Olho Direito (OD)</span>
                          </div>
                        </div>
                      ) : null}
                      {selectedPatient.report.selectedImages?.oe ? (
                        <div className="premium-card p-2 group hover:border-cardinal-200 transition-all cursor-pointer overflow-hidden">
                          <div className="aspect-[4/3] rounded-lg overflow-hidden bg-sandstone-100">
                            <img
                              src={selectedPatient.images.find(img => img.id === selectedPatient.report?.selectedImages?.oe)?.data || ''}
                              alt="Olho Esquerdo"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                              onClick={() => {
                                const url = selectedPatient.images.find(img => img.id === selectedPatient.report?.selectedImages?.oe)?.data;
                                if (url) window.open(url, '_blank');
                              }}
                            />
                          </div>
                          <div className="mt-3 flex justify-between items-center px-2">
                            <span className="text-[10px] font-bold text-sandstone-400 uppercase tracking-widest">Olho Esquerdo (OE)</span>
                          </div>
                        </div>
                      ) : null}
                      {(!selectedPatient.report.selectedImages?.od && !selectedPatient.report.selectedImages?.oe) && (
                        selectedPatient.images.slice(0, 2).map((image, index) => (
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
                            </div>
                          </div>
                        ))
                      )}
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
                              {selectedPatient.report.diagnosticConditions.hrMild && (
                                <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                  RH Leve
                                </span>
                              )}
                              {selectedPatient.report.diagnosticConditions.hrModerate && (
                                <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                  RH Moderada
                                </span>
                              )}
                              {selectedPatient.report.diagnosticConditions.hrSevere && (
                                <span className="px-3 py-1 bg-blue-700 text-white border border-blue-800 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                  RH Grave
                                </span>
                              )}
                              {selectedPatient.report.diagnosticConditions.reconvocarUrgente && (
                                <span className="px-3 py-1 bg-orange-600 text-white border border-orange-700 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                  Re-convocar Prioridade
                                </span>
                              )}
                              {selectedPatient.report.diagnosticConditions.reconvocar && (
                                <span className="px-3 py-1 bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                  Re-convocar
                                </span>
                              )}
                              {selectedPatient.report.diagnosticConditions.encaminhar && (
                                <span className="px-3 py-1 bg-purple-600 text-white border border-purple-700 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                  Encaminhar
                                  <ArrowUpRight className="w-3 h-3 inline-block ml-1" />
                                </span>
                              )}
                              {selectedPatient.report.diagnosticConditions.tumor && (
                                <span className="px-3 py-1 bg-red-700 text-white border border-red-800 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm">
                                  Tumor / Massa
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
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                                      <div className="space-y-3">
                                        <h5 className="text-[10px] font-bold text-cardinal-700 uppercase tracking-widest border-b border-cardinal-100 pb-1">Olho Direito (OD)</h5>
                                        <div className="grid grid-cols-1 gap-2">
                                          <div className="flex items-start space-x-3 p-2 bg-sandstone-50/50 rounded-lg border border-sandstone-100">
                                            <p className="text-[8px] font-bold text-sandstone-400 uppercase w-16 mt-1">Nervo</p>
                                            <p className="text-xs font-serif text-charcoal leading-snug">{f.od.opticNerve || 'Sem notas'}</p>
                                          </div>
                                          <div className="flex items-start space-x-3 p-2 bg-sandstone-50/50 rounded-lg border border-sandstone-100">
                                            <p className="text-[8px] font-bold text-sandstone-400 uppercase w-16 mt-1">Retina</p>
                                            <p className="text-xs font-serif text-charcoal leading-snug">{f.od.retina || 'Sem notas'}</p>
                                          </div>
                                          <div className="flex items-start space-x-3 p-2 bg-sandstone-50/50 rounded-lg border border-sandstone-100">
                                            <p className="text-[8px] font-bold text-sandstone-400 uppercase w-16 mt-1">Vasos</p>
                                            <p className="text-xs font-serif text-charcoal leading-snug">{f.od.vessels || 'Sem notas'}</p>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="space-y-3">
                                        <h5 className="text-[10px] font-bold text-cardinal-700 uppercase tracking-widest border-b border-cardinal-100 pb-1">Olho Esquerdo (OE)</h5>
                                        <div className="grid grid-cols-1 gap-2">
                                          <div className="flex items-start space-x-3 p-2 bg-sandstone-50/50 rounded-lg border border-sandstone-100">
                                            <p className="text-[8px] font-bold text-sandstone-400 uppercase w-16 mt-1">Nervo</p>
                                            <p className="text-xs font-serif text-charcoal leading-snug">{f.oe.opticNerve || 'Sem notas'}</p>
                                          </div>
                                          <div className="flex items-start space-x-3 p-2 bg-sandstone-50/50 rounded-lg border border-sandstone-100">
                                            <p className="text-[8px] font-bold text-sandstone-400 uppercase w-16 mt-1">Retina</p>
                                            <p className="text-xs font-serif text-charcoal leading-snug">{f.oe.retina || 'Sem notas'}</p>
                                          </div>
                                          <div className="flex items-start space-x-3 p-2 bg-sandstone-50/50 rounded-lg border border-sandstone-100">
                                            <p className="text-[8px] font-bold text-sandstone-400 uppercase w-16 mt-1">Vasos</p>
                                            <p className="text-xs font-serif text-charcoal leading-snug">{f.oe.vessels || 'Sem notas'}</p>
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
                              {(() => {
                                const diagnosis = selectedPatient.report.diagnosis || '';
                                if (diagnosis.includes(' - ')) {
                                  return diagnosis.split(' - ')[0];
                                }
                                return diagnosis;
                              })()}
                            </p>
                          </div>
                        </section>

                        {(() => {
                          try {
                            const f = JSON.parse(selectedPatient.report.findings);
                            const isOdUnsatisfactory = f.od?.quality === 'unsatisfactory';
                            const isOeUnsatisfactory = f.oe?.quality === 'unsatisfactory';

                            if (isOdUnsatisfactory || isOeUnsatisfactory) {
                              return (
                                <section className="bg-orange-50/50 border-l-4 border-orange-400 p-6 rounded-r-2xl space-y-3">
                                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-700 space-x-2 flex items-center">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>Limitações Técnicas Detectadas</span>
                                  </h4>
                                  <div className="space-y-4">
                                    {isOdUnsatisfactory && (
                                      <div>
                                        <p className="text-[9px] font-bold text-orange-800 uppercase mb-1">Olho Direito (OD)</p>
                                        <p className="text-sm font-serif text-charcoal italic">{f.od.limitationReason || 'Qualidade de imagem insuficiente para análise detalhada.'}</p>
                                      </div>
                                    )}
                                    {isOeUnsatisfactory && (
                                      <div>
                                        <p className="text-[9px] font-bold text-orange-800 uppercase mb-1">Olho Esquerdo (OE)</p>
                                        <p className="text-sm font-serif text-charcoal italic">{f.oe.limitationReason || 'Qualidade de imagem insuficiente para análise detalhada.'}</p>
                                      </div>
                                    )}
                                  </div>
                                </section>
                              );
                            }
                          } catch (e) {
                            return null;
                          }
                          return null;
                        })()}

                        <section>
                          <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-sandstone-400 mb-4 divider-after">Conduta Sugerida</h4>
                          <div className="space-y-4">
                            {(() => {
                              const diagnosis = selectedPatient.report.diagnosis || '';
                              const phrases: string[] = [];

                              // 1. Check for split from diagnosis
                              if (diagnosis.includes(' - ')) {
                                phrases.push(diagnosis.split(' - ').slice(1).join(' - '));
                              }

                              // 2. Check for new field
                              if (selectedPatient.report.suggestedConduct) {
                                phrases.push(selectedPatient.report.suggestedConduct);
                              }

                              // 3. Fallback to recommendations if others are empty (legacy)
                              if (phrases.length === 0 && selectedPatient.report.recommendations) {
                                phrases.push(selectedPatient.report.recommendations);
                              }

                              if (phrases.length === 0) {
                                return <p className="text-sm text-sandstone-400 font-medium italic">Nenhuma conduta especificada.</p>;
                              }

                              return phrases.map((p, i) => (
                                <p key={i} className="text-sm text-sandstone-600 font-medium leading-relaxed italic">
                                  {p}
                                </p>
                              ));
                            })()}
                          </div>
                        </section>

                        {/* Display recommendations separately if they Exist and are different from suggestedConduct */}
                        {selectedPatient.report.recommendations &&
                          !selectedPatient.report.diagnosis.includes(selectedPatient.report.recommendations) &&
                          selectedPatient.report.suggestedConduct !== selectedPatient.report.recommendations && (
                            <section>
                              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-sandstone-400 mb-4 divider-after">Recomendações Adicionais</h4>
                              <p className="text-sm text-sandstone-600 font-medium leading-relaxed italic">
                                {selectedPatient.report.recommendations}
                              </p>
                            </section>
                          )}
                      </div>
                    </div>
                  </div>

                  {/* Signature Block */}
                  <div className="pt-16 pb-8 border-t border-sandstone-100 flex flex-col items-center text-center">
                    <div className="text-charcoal font-serif text-xl font-bold mb-1 italic">
                      {selectedPatient.report.doctorName}
                    </div>
                    {(selectedPatient.report.doctorCRM || selectedPatient.report.doctorName === 'Dr. Gustavo Sakuno') && (
                      <div className="text-[12px] font-bold text-sandstone-600 mb-2">
                        {selectedPatient.report.doctorCRM || 'CRM-SP 177.943'}
                      </div>
                    )}
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
        )
      }

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .min-h-screen { min-height: 0 !important; overflow: visible !important; }
          .stagger-load { transform: none !important; opacity: 1 !important; }
          .premium-card { border: 1px solid #e5e7eb !important; box-shadow: none !important; }
          .print-area { padding: 0 !important; box-shadow: none !important; }
          @page {
            margin: 1cm;
            size: portrait;
          }
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

      {/* Hidden Render Area for PDF Export */}
      <div
        id="report-capture-area"
        className="fixed left-[-9999px] top-0 pointer-events-none"
        style={{ width: '1000px' }}
      >
        {renderPatient && <ReportPrintTemplate patient={renderPatient} />}
      </div>
    </div >
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
