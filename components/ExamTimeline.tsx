'use client';

import React from 'react';
import { Calendar, CheckCircle2, Clock, FileText, Image as ImageIcon } from 'lucide-react';
import { Exam } from '@/types';

interface ExamTimelineProps {
    exams: Exam[];
    selectedExamId: string | null;
    onSelectExam: (exam: Exam) => void;
}

export default function ExamTimeline({ exams, selectedExamId, onSelectExam }: ExamTimelineProps) {
    // Ordena exames por data (mais recente primeiro)
    const sortedExams = [...exams].sort((a, b) =>
        new Date(b.examDate).getTime() - new Date(a.examDate).getTime()
    );

    const formatDate = (dateString: string) => {
        try {
            return new Date(dateString).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        } catch {
            return dateString;
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle2 className="w-4 h-4 text-green-500" />;
            case 'in_analysis':
                return <Clock className="w-4 h-4 text-yellow-500" />;
            default:
                return <Clock className="w-4 h-4 text-sandstone-400" />;
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'completed':
                return 'Laudado';
            case 'in_analysis':
                return 'Em análise';
            default:
                return 'Pendente';
        }
    };

    if (exams.length <= 1) {
        return null; // Não mostra timeline se só tem um exame
    }

    return (
        <div className="mb-6 p-4 bg-sandstone-50 rounded-xl border border-sandstone-100">
            <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-cardinal-700" />
                <h3 className="text-sm font-bold text-charcoal uppercase tracking-wider">
                    Histórico de Exames ({exams.length} visitas)
                </h3>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {sortedExams.map((exam, index) => {
                    const isSelected = exam.id === selectedExamId;
                    const isLatest = index === 0;

                    return (
                        <button
                            key={exam.id}
                            onClick={() => onSelectExam(exam)}
                            className={`
                flex-shrink-0 p-3 rounded-lg border-2 transition-all duration-200
                min-w-[140px] text-left
                ${isSelected
                                    ? 'border-cardinal-700 bg-white shadow-md'
                                    : 'border-sandstone-200 bg-white hover:border-cardinal-300 hover:shadow-sm'
                                }
              `}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className={`
                  text-xs font-bold uppercase tracking-wide
                  ${isSelected ? 'text-cardinal-700' : 'text-sandstone-500'}
                `}>
                                    {isLatest ? 'Mais recente' : `Visita ${sortedExams.length - index}`}
                                </span>
                                {getStatusIcon(exam.status)}
                            </div>

                            <div className="text-sm font-semibold text-charcoal mb-1">
                                {formatDate(exam.examDate)}
                            </div>

                            <div className="flex items-center gap-3 text-xs text-sandstone-500">
                                <span className="flex items-center gap-1">
                                    <ImageIcon className="w-3 h-3" />
                                    {exam.images?.length || 0}
                                </span>
                                <span className={`
                  px-1.5 py-0.5 rounded text-[10px] font-medium
                  ${exam.status === 'completed'
                                        ? 'bg-green-100 text-green-700'
                                        : exam.status === 'in_analysis'
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-sandstone-100 text-sandstone-600'
                                    }
                `}>
                                    {getStatusLabel(exam.status)}
                                </span>
                            </div>

                            {exam.location && (
                                <div className="text-[10px] text-sandstone-400 mt-1 truncate">
                                    {exam.location}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
