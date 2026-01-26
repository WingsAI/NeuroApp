'use client';

import { useState, useEffect, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import { Search, User, Image as ImageIcon, X, ChevronLeft, ChevronRight, Loader2, Eye, Calendar, FolderOpen } from 'lucide-react';
import { getCloudMappingAction } from '@/app/actions/patients';

interface PatientImage {
    filename: string;
    bytescale_url: string;
    upload_date: string;
}

interface PatientData {
    patient_name: string;
    exam_id: string;
    bytescale_folder: string;
    images: PatientImage[];
}

interface BytescaleMapping {
    [key: string]: PatientData;
}

export default function PatientsGallery() {
    const [patients, setPatients] = useState<BytescaleMapping>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
    const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lightboxOpen, setLightboxOpen] = useState(false);

    const [visibleCount, setVisibleCount] = useState(10);

    // Carrega os dados do mapeamento
    useEffect(() => {
        const loadPatients = async () => {
            try {
                const data = await getCloudMappingAction();
                if (!data) {
                    throw new Error('Falha ao carregar dados dos pacientes');
                }
                setPatients(data);
            } catch (err) {
                setError('Erro ao carregar dados. Verifique se o arquivo bytescale_mapping.json está em /public');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        loadPatients();
    }, []);

    // Filtra pacientes pelo termo de busca
    const filteredPatients = useMemo(() => {
        const entries = Object.entries(patients);
        if (!searchTerm.trim()) return entries;

        const term = searchTerm.toLowerCase();
        return entries.filter(([_, data]) =>
            data.patient_name.toLowerCase().includes(term)
        );
    }, [patients, searchTerm]);

    // Reseta a contagem visível ao buscar
    useEffect(() => {
        setVisibleCount(10);
    }, [searchTerm]);

    // Pacientes visíveis na página atual
    const displayedPatients = useMemo(() => {
        return filteredPatients.slice(0, visibleCount);
    }, [filteredPatients, visibleCount]);

    // Estatísticas
    const stats = useMemo(() => {
        const total = Object.keys(patients).length;
        const totalImages = Object.values(patients).reduce(
            (sum, p) => sum + (p.images?.length || 0), 0
        );
        return { total, totalImages };
    }, [patients]);

    // Navegação no lightbox
    const handlePrevImage = () => {
        if (!selectedPatient) return;
        const patient = patients[selectedPatient];
        setSelectedImageIndex((prev) =>
            prev === 0 ? patient.images.length - 1 : prev - 1
        );
    };

    const handleNextImage = () => {
        if (!selectedPatient) return;
        const patient = patients[selectedPatient];
        setSelectedImageIndex((prev) =>
            prev === patient.images.length - 1 ? 0 : prev + 1
        );
    };

    const openLightbox = (patientKey: string, imageIndex: number) => {
        setSelectedPatient(patientKey);
        setSelectedImageIndex(imageIndex);
        setLightboxOpen(true);
    };

    const closeLightbox = () => {
        setLightboxOpen(false);
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!lightboxOpen) return;
            if (e.key === 'ArrowLeft') handlePrevImage();
            if (e.key === 'ArrowRight') handleNextImage();
            if (e.key === 'Escape') closeLightbox();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightboxOpen, selectedPatient]);

    if (loading) {
        return (
            <div className="min-h-screen relative overflow-hidden">
                <div className="noise-overlay" />
                <Navbar />
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                    <div className="flex items-center justify-center h-96">
                        <Loader2 className="w-12 h-12 text-cardinal-700 animate-spin" />
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen relative overflow-hidden">
            <div className="noise-overlay" />
            <Navbar />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
                <div className="stagger-load space-y-12">
                    {/* Header */}
                    <div className="max-w-2xl">
                        <div className="accent-line" />
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-charcoal mb-6 leading-[1.1]">
                            Galeria de <span className="text-cardinal-700 italic">Pacientes</span>
                        </h1>
                        <p className="text-lg text-sandstone-600 font-medium max-w-lg leading-relaxed">
                            Visualize e gerencie as imagens de fundo de olho armazenadas na nuvem.
                        </p>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="premium-card p-6 flex items-center space-x-4">
                            <div className="p-3 bg-cardinal-50 rounded-xl">
                                <User className="w-6 h-6 text-cardinal-700" />
                            </div>
                            <div>
                                <p className="text-3xl font-serif font-bold text-charcoal">{stats.total}</p>
                                <p className="text-sm text-sandstone-500">Pacientes</p>
                            </div>
                        </div>

                        <div className="premium-card p-6 flex items-center space-x-4">
                            <div className="p-3 bg-cardinal-50 rounded-xl">
                                <ImageIcon className="w-6 h-6 text-cardinal-700" />
                            </div>
                            <div>
                                <p className="text-3xl font-serif font-bold text-charcoal">{stats.totalImages.toLocaleString()}</p>
                                <p className="text-sm text-sandstone-500">Imagens na Nuvem</p>
                            </div>
                        </div>

                        <div className="premium-card p-6 flex items-center space-x-4">
                            <div className="p-3 bg-green-50 rounded-xl">
                                <FolderOpen className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <p className="text-3xl font-serif font-bold text-charcoal">Bytescale</p>
                                <p className="text-sm text-sandstone-500">Armazenamento Cloud</p>
                            </div>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="premium-card p-6">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-sandstone-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Buscar por nome do paciente..."
                                className="input-premium pl-12 w-full"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-sandstone-400 hover:text-cardinal-700"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                        <p className="mt-3 text-sm text-sandstone-500">
                            {filteredPatients.length} de {stats.total} pacientes
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
                            <p className="text-red-700">{error}</p>
                        </div>
                    )}

                    {/* Patient List */}
                    <div className="space-y-6">
                        {displayedPatients.map(([key, patient]) => (
                            <div key={key} className="premium-card p-6 space-y-4">
                                {/* Patient Header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-4">
                                        <div className="p-3 bg-cardinal-50 rounded-full">
                                            <User className="w-6 h-6 text-cardinal-700" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-serif font-bold text-charcoal">
                                                {patient.patient_name}
                                            </h3>
                                            <p className="text-sm text-sandstone-500">
                                                ID: {patient.exam_id} • {patient.images?.length || 0} imagens
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2 text-sm text-sandstone-400">
                                        <Calendar className="w-4 h-4" />
                                        <span>
                                            {patient.images?.[0]?.upload_date
                                                ? new Date(patient.images[0].upload_date).toLocaleDateString('pt-BR')
                                                : 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                {/* Image Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                    {patient.images?.slice(0, 8).map((image, index) => (
                                        <div
                                            key={image.filename}
                                            onClick={() => openLightbox(key, index)}
                                            className="relative group cursor-pointer rounded-lg overflow-hidden aspect-square bg-sandstone-100"
                                        >
                                            <img
                                                src={image.bytescale_url}
                                                alt={image.filename}
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                                loading="lazy"
                                            />
                                            <div className="absolute inset-0 bg-charcoal/0 group-hover:bg-charcoal/40 transition-colors flex items-center justify-center">
                                                <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        </div>
                                    ))}
                                    {patient.images?.length > 8 && (
                                        <div
                                            onClick={() => openLightbox(key, 8)}
                                            className="relative cursor-pointer rounded-lg overflow-hidden aspect-square bg-cardinal-50 flex items-center justify-center group hover:bg-cardinal-100 transition-colors"
                                        >
                                            <span className="text-cardinal-700 font-bold text-lg">
                                                +{patient.images.length - 8}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Load More Button */}
                        {visibleCount < filteredPatients.length && (
                            <div className="flex justify-center pt-8">
                                <button
                                    onClick={() => setVisibleCount(prev => prev + 10)}
                                    className="btn-cardinal flex items-center space-x-2 px-8"
                                >
                                    <ChevronRight className="w-5 h-5 rotate-90" />
                                    <span>Ver Mais Pacientes</span>
                                </button>
                            </div>
                        )}

                        {filteredPatients.length === 0 && !loading && (
                            <div className="premium-card p-12 text-center">
                                <User className="w-16 h-16 text-sandstone-300 mx-auto mb-4" />
                                <h3 className="text-xl font-serif font-bold text-charcoal mb-2">
                                    Nenhum paciente encontrado
                                </h3>
                                <p className="text-sandstone-500">
                                    Tente outro termo de busca
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Lightbox */}
            {lightboxOpen && selectedPatient && patients[selectedPatient] && (
                <div
                    className="fixed inset-0 z-50 bg-charcoal/95 flex items-center justify-center"
                    onClick={closeLightbox}
                >
                    <button
                        onClick={closeLightbox}
                        className="absolute top-6 right-6 p-3 text-white/70 hover:text-white transition-colors"
                    >
                        <X className="w-8 h-8" />
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); handlePrevImage(); }}
                        className="absolute left-6 p-3 text-white/70 hover:text-white transition-colors"
                    >
                        <ChevronLeft className="w-10 h-10" />
                    </button>

                    <div
                        className="max-w-5xl max-h-[85vh] relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={patients[selectedPatient].images[selectedImageIndex]?.bytescale_url}
                            alt="Exam Image"
                            className="max-w-full max-h-[85vh] object-contain rounded-lg"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-charcoal/80 to-transparent p-6">
                            <p className="text-white font-serif font-bold text-lg">
                                {patients[selectedPatient].patient_name}
                            </p>
                            <p className="text-white/70 text-sm">
                                Imagem {selectedImageIndex + 1} de {patients[selectedPatient].images.length}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
                        className="absolute right-6 p-3 text-white/70 hover:text-white transition-colors"
                    >
                        <ChevronRight className="w-10 h-10" />
                    </button>

                    {/* Thumbnail strip */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 max-w-[80vw] overflow-x-auto p-2 bg-charcoal/50 rounded-lg backdrop-blur">
                        {patients[selectedPatient].images.slice(0, 12).map((img, idx) => (
                            <button
                                key={img.filename}
                                onClick={(e) => { e.stopPropagation(); setSelectedImageIndex(idx); }}
                                className={`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${idx === selectedImageIndex ? 'border-cardinal-500 scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                                    }`}
                            >
                                <img src={img.bytescale_url} alt="" className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
