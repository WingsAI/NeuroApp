'use client';

import { useState } from 'react';
import { Upload, AlertCircle, CheckCircle2, Loader2, Sparkles, User, Calendar, MapPin, Clipboard } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { createPatient } from '@/app/actions/patients';
import { Patient, PatientImage } from '@/types';

export default function Home() {
  const [integrationMode, setIntegrationMode] = useState<'manual' | 'eyer'>('manual');
  const [eyerPatientId, setEyerPatientId] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    birthDate: '',
    examDate: '',
    location: '',
    technicianName: '',
  });

  const [images, setImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length + images.length > 3) {
      setError('Você pode fazer upload de no máximo 3 imagens.');
      return;
    }

    setImages([...images, ...files]);

    // Criar URLs de preview
    const newPreviewUrls = files.map(file => URL.createObjectURL(file));
    setPreviewUrls([...previewUrls, ...newPreviewUrls]);
    setError('');
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);

    if (files.length + images.length > 3) {
      setError('Você pode fazer upload de no máximo 3 imagens.');
      return;
    }

    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    setImages([...images, ...imageFiles]);

    const newPreviewUrls = imageFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls([...previewUrls, ...newPreviewUrls]);
    setError('');
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    const newPreviewUrls = previewUrls.filter((_, i) => i !== index);
    setImages(newImages);
    setPreviewUrls(newPreviewUrls);
  };

  const handleEyerSearch = async () => {
    if (!eyerPatientId.trim()) {
      setError('Por favor, insira o ID do paciente no EyeR.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));

      setFormData({
        name: 'Paciente Importado do EyeR',
        cpf: '123.456.789-00',
        birthDate: '1980-05-15',
        examDate: new Date().toISOString().split('T')[0],
        location: 'EyeR Phelcom',
        technicianName: 'Sistema EyeR',
      });

      const mockImages = [
        'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzFhMWExYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjIwIiBmaWxsPSIjOGMxNTE1IiBmYW1pbHk9InNlcmlmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj5FeWVSIC0gSW1hZ2VtIDE8L3RleHQ+PC9zdmc+',
        'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzFhMWExYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjIwIiBmaWxsPSIjOGMxNTE1IiBmYW1pbHk9InNlcmlmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj5FeWVSIC0gSW1hZ2VtIDI8L3RleHQ+PC9zdmc+',
        'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzFhMWExYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjIwIiBmaWxsPSIjOGMxNTE1IiBmYW1pbHk9InNlcmlmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj5FeWVSIC0gSW1hZ2VtIDM8L3RleHQ+PC9zdmc+',
      ];

      setPreviewUrls(mockImages);
      setImages([] as any);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);

    } catch (err) {
      setError('Erro ao buscar dados do EyeR. Verifique o ID e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!formData.name || !formData.cpf || !formData.birthDate ||
      !formData.examDate || !formData.location || !formData.technicianName) {
      setError('Todos os campos são obrigatórios.');
      return;
    }

    if (integrationMode === 'manual' && images.length !== 3) {
      setError('É necessário fazer upload de exatamente 3 imagens.');
      return;
    }

    if (integrationMode === 'eyer' && previewUrls.length !== 3) {
      setError('É necessário importar os dados do EyeR primeiro.');
      return;
    }

    if (!confirmed) {
      setError('Você deve confirmar o envio marcando o checkbox.');
      return;
    }

    setLoading(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('cpf', formData.cpf);
      formDataToSend.append('birthDate', formData.birthDate);
      formDataToSend.append('examDate', formData.examDate);
      formDataToSend.append('location', formData.location);
      formDataToSend.append('technicianName', formData.technicianName);

      if (integrationMode === 'eyer') {
        previewUrls.forEach(url => {
          formDataToSend.append('eyerUrls', url);
        });
      } else {
        images.forEach(file => {
          formDataToSend.append('images', file);
        });
      }

      await createPatient(formDataToSend);
      setSuccess(true);

      setTimeout(() => {
        setFormData({
          name: '',
          cpf: '',
          birthDate: '',
          examDate: '',
          location: '',
          technicianName: '',
        });
        setImages([]);
        setPreviewUrls([]);
        setConfirmed(false);
        setSuccess(false);
      }, 2000);

    } catch (err) {
      setError('Erro ao salvar os dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="noise-overlay" />
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="stagger-load space-y-12">
          {/* Header Section */}
          <div className="max-w-2xl">
            <div className="accent-line" />
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-charcoal mb-6 leading-[1.1]">
              Registro de <span className="text-cardinal-700 italic">Paciente</span>
            </h1>
            <p className="text-lg text-sandstone-600 font-medium max-w-lg leading-relaxed">
              Sistema inteligente para gestão neuroftalmológica.
              Integração direta com equipamentos Phelcom EyeR.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Integration Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div
                onClick={() => setIntegrationMode('manual')}
                className={`premium-card p-6 cursor-pointer border-2 transition-all ${integrationMode === 'manual'
                  ? 'border-cardinal-700 shadow-premium-hover'
                  : 'border-transparent'
                  }`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`p-3 rounded-xl ${integrationMode === 'manual' ? 'bg-cardinal-700 text-white' : 'bg-sandstone-100 text-sandstone-400'}`}>
                    <Clipboard className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-xl text-charcoal">Ficha Manual</h3>
                    <p className="text-sm text-sandstone-500">Upload direto de arquivos locais</p>
                  </div>
                </div>
              </div>

              <div
                onClick={() => setIntegrationMode('eyer')}
                className={`premium-card p-6 cursor-pointer border-2 transition-all ${integrationMode === 'eyer'
                  ? 'border-cardinal-700 shadow-premium-hover'
                  : 'border-transparent'
                  }`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`p-3 rounded-xl ${integrationMode === 'eyer' ? 'bg-cardinal-700 text-white' : 'bg-sandstone-100 text-sandstone-400'}`}>
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-xl text-charcoal">EyeR Phelcom</h3>
                    <p className="text-sm text-sandstone-500">Importação automática via API</p>
                  </div>
                </div>
              </div>
            </div>

            {/* EyeR Search */}
            {integrationMode === 'eyer' && (
              <div className="premium-card p-8 bg-cardinal-950/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Sparkles className="w-24 h-24 text-cardinal-700" />
                </div>
                <div className="relative z-10">
                  <h3 className="text-xl font-serif font-bold text-charcoal mb-4">Sincronização EyeR</h3>
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={eyerPatientId}
                        onChange={(e) => setEyerPatientId(e.target.value)}
                        className="input-premium pl-12"
                        placeholder="Ex: EYER-2024-001234"
                      />
                      <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-sandstone-300" />
                    </div>
                    <button
                      type="button"
                      onClick={handleEyerSearch}
                      disabled={loading}
                      className="btn-cardinal whitespace-nowrap"
                    >
                      {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Sincronizar Dados'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Main Form Fields */}
            <div className="premium-card p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                    <User className="w-4 h-4 mr-2" /> Nome do Paciente
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="input-premium"
                    placeholder="Nome completo"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                    <Clipboard className="w-4 h-4 mr-2" /> CPF
                  </label>
                  <input
                    type="text"
                    name="cpf"
                    value={formData.cpf}
                    onChange={handleInputChange}
                    className="input-premium"
                    placeholder="000.000.000-00"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                    <Calendar className="w-4 h-4 mr-2" /> Data de Nascimento
                  </label>
                  <input
                    type="date"
                    name="birthDate"
                    value={formData.birthDate}
                    onChange={handleInputChange}
                    className="input-premium"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                    <Calendar className="w-4 h-4 mr-2" /> Data do Exame
                  </label>
                  <input
                    type="date"
                    name="examDate"
                    value={formData.examDate}
                    onChange={handleInputChange}
                    className="input-premium"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                    <MapPin className="w-4 h-4 mr-2" /> Local do Exame
                  </label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    className="input-premium"
                    placeholder="Clínica ou Hospital"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                    <User className="w-4 h-4 mr-2" /> Técnico Responsável
                  </label>
                  <input
                    type="text"
                    name="technicianName"
                    value={formData.technicianName}
                    onChange={handleInputChange}
                    className="input-premium"
                    placeholder="Nome completo do técnico"
                  />
                </div>
              </div>

              {/* Image Section */}
              <div className="pt-8 border-t border-sandstone-100">
                {integrationMode === 'manual' ? (
                  <div className="space-y-4">
                    <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500">
                      Documentação Visual (3 Imagens)
                    </label>
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      className="group border-2 border-dashed border-sandstone-200 rounded-2xl p-12 text-center hover:border-cardinal-700 transition-all cursor-pointer bg-sandstone-50 hover:bg-white"
                    >
                      <input
                        type="file"
                        id="images"
                        accept="image/*"
                        multiple
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      <label htmlFor="images" className="cursor-pointer">
                        <div className="bg-white p-4 rounded-full w-20 h-20 mx-auto shadow-sm group-hover:scale-110 transition-transform flex items-center justify-center">
                          <Upload className="h-8 w-8 text-cardinal-700" />
                        </div>
                        <p className="mt-6 text-xl font-serif font-bold text-charcoal">Arraste as imagens aqui</p>
                        <p className="mt-2 text-sandstone-500">ou clique para explorar arquivos locais</p>
                      </label>
                    </div>

                    {images.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
                        {previewUrls.map((url, index) => (
                          <div key={index} className="relative group rounded-xl overflow-hidden shadow-premium">
                            <img src={url} alt="Preview" className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-700" />
                            <div className="absolute inset-0 bg-charcoal/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => removeImage(index)}
                                className="bg-white/90 text-cardinal-700 p-3 rounded-full hover:bg-white"
                              >
                                <AlertCircle className="w-6 h-6" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  previewUrls.length > 0 && (
                    <div className="space-y-4">
                      <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500">
                        Imagens Sincronizadas (Phelcom EyeR)
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {previewUrls.map((url, index) => (
                          <div key={index} className="relative rounded-xl overflow-hidden shadow-premium border-2 border-cardinal-700">
                            <img src={url} alt="EyeR" className="w-full h-48 object-cover" />
                            <div className="absolute top-3 left-3 bg-cardinal-700 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded">
                              Equipment Sync
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* Footer & Submit */}
              <div className="pt-8 border-t border-sandstone-100 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-start max-w-md">
                  <div className="flex items-center h-6">
                    <input
                      id="confirm"
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="w-5 h-5 text-cardinal-700 border-sandstone-300 rounded focus:ring-cardinal-500"
                    />
                  </div>
                  <label htmlFor="confirm" className="ml-3 text-sm text-sandstone-600 font-medium">
                    Declaro que validei a autenticidade das imagens e a precisão dos dados clínicos do paciente.
                  </label>
                </div>

                <div className="w-full md:w-auto min-w-[240px]">
                  <button
                    type="submit"
                    disabled={loading || success}
                    className="w-full btn-cardinal flex items-center justify-center space-x-3"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin w-5 h-5" />
                    ) : success ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Sparkles className="w-5 h-5" />
                    )}
                    <span className="text-lg uppercase tracking-widest font-bold">
                      {loading ? 'Processando...' : success ? 'Sucesso' : 'Finalizar Registro'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Notifications */}
            <div className="fixed bottom-8 right-8 z-50 pointer-events-none">
              <div className="space-y-4">
                {error && (
                  <div className="bg-white border-l-4 border-cardinal-700 shadow-2xl p-6 rounded-lg flex items-center space-x-4 animate-in slide-in-from-right pointer-events-auto">
                    <div className="p-2 bg-cardinal-50 rounded-full">
                      <AlertCircle className="w-6 h-6 text-cardinal-700" />
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-charcoal">Erro no Sistema</h4>
                      <p className="text-sm text-sandstone-500">{error}</p>
                    </div>
                  </div>
                )}

                {success && (
                  <div className="bg-white border-l-4 border-green-600 shadow-2xl p-6 rounded-lg flex items-center space-x-4 animate-in slide-in-from-right pointer-events-auto">
                    <div className="p-2 bg-green-50 rounded-full">
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-charcoal">Registro Efetuado</h4>
                      <p className="text-sm text-sandstone-500">Paciente salvo com sucesso no banco de dados.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

