'use client';

import React from 'react';
import { User, Calendar, MapPin, Image as ImageIcon, CheckCircle2, Clock, History } from 'lucide-react';
import { Patient, Exam } from '@/types';

interface PatientCardProps {
    patient: Patient;
    onSelect: (patient: Patient) => void;
    isSelected?: boolean;
}

export default function PatientCard({ patient, onSelect, isSelected }: PatientCardProps) {
    const totalExams = patient.exams?.length || 1;
    const latestExam = patient.exams?.sort((a, b) =>
        new Date(b.examDate).getTime() - new Date(a.examDate).getTime()
    )[0];

    const pendingExams = patient.exams?.filter(e => e.status === 'pending').length || 0;
    const completedExams = patient.exams?.filter(e => e.status === 'completed').length || 0;

    const totalImages = patient.exams?.reduce((sum, e) => sum + (e.images?.length || 0), 0) || 0;

    const formatDate = (dateString?: string) => {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleDateString('pt-BR');
        } catch {
            return dateString;
        }
    };

    const formatCPF = (cpf?: string) => {
        if (!cpf || cpf.startsWith('AUTO-') || cpf.startsWith('CONFLICT-') || cpf === 'PENDENTE') {
            return null;
        }
        if (cpf.length === 11) {
            return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
        }
        return cpf;
    };

    const formattedCPF = formatCPF(patient.cpf);

    return (
        <div
            onClick={() => onSelect(patient)}
            className={`
        group cursor-pointer rounded-xl border-2 p-4 transition-all duration-200
        hover:shadow-lg hover:scale-[1.01]
        ${isSelected
                    ? 'border-cardinal-700 bg-cardinal-50/50 shadow-md'
                    : 'border-sandstone-100 bg-white hover:border-cardinal-200'
                }
      `}
        >
            <div className="flex items-start justify-between gap-3">
                {/* Avatar e Info Principal */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`
            flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
            ${isSelected ? 'bg-cardinal-700 text-white' : 'bg-cardinal-100 text-cardinal-700'}
            group-hover:bg-cardinal-700 group-hover:text-white transition-colors
          `}>
                        <User className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-charcoal truncate group-hover:text-cardinal-700 transition-colors">
                            {patient.name}
                        </h3>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-sandstone-500">
                            {formattedCPF && (
                                <span className="font-mono">{formattedCPF}</span>
                            )}
                            {patient.birthDate && (
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {formatDate(patient.birthDate)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Badge de Exames */}
                {totalExams > 1 && (
                    <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full">
                        <History className="w-3 h-3" />
                        <span className="text-xs font-bold">{totalExams}</span>
                    </div>
                )}
            </div>

            {/* Info do Último Exame */}
            {latestExam && (
                <div className="mt-3 pt-3 border-t border-sandstone-100">
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3 text-sandstone-500">
                            <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(latestExam.examDate)}
                            </span>
                            {latestExam.location && (
                                <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {latestExam.location}
                                </span>
                            )}
                            <span className="flex items-center gap-1">
                                <ImageIcon className="w-3 h-3" />
                                {totalImages} img
                            </span>
                        </div>

                        {/* Status Badge */}
                        <div className={`
              flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
              ${pendingExams > 0
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                            }
            `}>
                            {pendingExams > 0 ? (
                                <>
                                    <Clock className="w-3 h-3" />
                                    {pendingExams} pendente{pendingExams > 1 ? 's' : ''}
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    Todos laudados
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
