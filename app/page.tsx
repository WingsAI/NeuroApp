'use client';

import { useState } from 'react';
import { Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { savePatient, generateId, fileToBase64 } from '@/lib/storage';
import { Patient, PatientImage } from '@/types';

export default function Home() {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Validações
    if (!formData.name || !formData.cpf || !formData.birthDate ||
        !formData.examDate || !formData.location || !formData.technicianName) {
      setError('Todos os campos são obrigatórios.');
      return;
    }

    if (images.length !== 3) {
      setError('É necessário fazer upload de exatamente 3 imagens.');
      return;
    }

    if (!confirmed) {
      setError('Você deve confirmar o envio marcando o checkbox.');
      return;
    }

    setLoading(true);

    try {
      // Converter imagens para base64
      const patientImages: PatientImage[] = await Promise.all(
        images.map(async (file, index) => ({
          id: generateId(),
          data: await fileToBase64(file),
          fileName: file.name,
          uploadedAt: new Date().toISOString(),
        }))
      );

      // Criar objeto paciente
      const patient: Patient = {
        id: generateId(),
        name: formData.name,
        cpf: formData.cpf,
        birthDate: formData.birthDate,
        examDate: formData.examDate,
        location: formData.location,
        technicianName: formData.technicianName,
        images: patientImages,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      // Salvar no localStorage
      savePatient(patient);

      setSuccess(true);

      // Limpar formulário após 2 segundos
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6 md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
              Registro de Paciente
            </h1>
            <p className="text-gray-600">
              Preencha os dados do paciente e faça o upload de 3 imagens neuroftalmológicas
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Dados do Paciente */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Nome do paciente"
                />
              </div>

              <div>
                <label htmlFor="cpf" className="block text-sm font-medium text-gray-700 mb-1">
                  CPF *
                </label>
                <input
                  type="text"
                  id="cpf"
                  name="cpf"
                  value={formData.cpf}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="000.000.000-00"
                />
              </div>

              <div>
                <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Nascimento *
                </label>
                <input
                  type="date"
                  id="birthDate"
                  name="birthDate"
                  value={formData.birthDate}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="examDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Data do Exame *
                </label>
                <input
                  type="date"
                  id="examDate"
                  name="examDate"
                  value={formData.examDate}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                  Local do Exame *
                </label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="UPA ou Hospital"
                />
              </div>

              <div>
                <label htmlFor="technicianName" className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do Técnico *
                </label>
                <input
                  type="text"
                  id="technicianName"
                  name="technicianName"
                  value={formData.technicianName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Seu nome"
                />
              </div>
            </div>

            {/* Upload de Imagens */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload de Imagens * (exatamente 3 imagens)
              </label>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-500 transition-colors cursor-pointer"
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
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-600">
                    Arraste e solte imagens aqui ou clique para selecionar
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Formatos: JPEG, PNG (máximo 3 imagens)
                  </p>
                </label>
              </div>

              {/* Preview das Imagens */}
              {images.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-4">
                  {previewUrls.map((url, index) => (
                    <div key={index} className="relative">
                      <img
                        src={url}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg border border-gray-300"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <p className="mt-1 text-xs text-gray-600 truncate">{images[index].name}</p>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-2 text-sm text-gray-600">
                Imagens selecionadas: <span className="font-semibold">{images.length}/3</span>
              </p>
            </div>

            {/* Confirmação */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="confirm"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
              </div>
              <label htmlFor="confirm" className="ml-3 text-sm text-gray-700">
                Confirmo que todos os dados estão corretos e as 3 imagens foram anexadas
              </label>
            </div>

            {/* Mensagens de Erro e Sucesso */}
            {error && (
              <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center p-4 bg-green-50 border border-green-200 rounded-md">
                <CheckCircle2 className="h-5 w-5 text-green-600 mr-2" />
                <p className="text-sm text-green-800">
                  Paciente registrado com sucesso! Redirecionando...
                </p>
              </div>
            )}

            {/* Botão de Envio */}
            <button
              type="submit"
              disabled={loading || success}
              className="w-full bg-primary-600 text-white py-3 px-6 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                  Salvando...
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Salvo com Sucesso!
                </>
              ) : (
                'Registrar Paciente'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
