'use server'

import prismaStaging from '@/lib/prisma-staging';
import { createClient } from '@/lib/supabase-server';

async function checkAuth() {
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        throw new Error('Nao autorizado');
    }
    return user;
}

/**
 * Fetch all patients from the staging database and return them
 * in the same shape as the main DB's getPatientsAction().
 *
 * Staging patients:
 * - Always have status = 'pending' (not yet reviewed by doctor)
 * - Images have no signed URLs yet (not uploaded to S3/Bytescale)
 * - Have a `_source` field indicating which EyerCloud clinic they came from
 */
export async function getStagingPatientsAction() {
    await checkAuth();

    try {
        const patients = await prismaStaging.stagingPatient.findMany({
            where: {
                isDuplicate: false,
            },
            include: {
                sourceLogin: {
                    select: { clinicName: true, email: true },
                },
                exams: {
                    include: {
                        images: true,
                    },
                    orderBy: { examDate: 'desc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return patients.map((p) => {
            const latestExam = p.exams.length > 0 ? p.exams[0] : null;

            // Map exams to the same shape as main DB
            const examsWithImages = p.exams.map((exam) => {
                const images = (exam.images || [])
                    .filter((img) => img.type !== 'REDFREE') // Filter REDFREE
                    .map((img) => ({
                        id: img.id,
                        url: img.url || '',
                        data: '', // No signed URL yet - images not uploaded
                        fileName: img.fileName,
                        type: img.type || 'UNKNOWN',
                        uploadedAt: img.uploadedAt?.toISOString() || new Date().toISOString(),
                        examId: img.examId,
                    }));

                return {
                    id: exam.id,
                    examDate: exam.examDate?.toISOString() || new Date().toISOString(),
                    location: exam.location || p.sourceLogin.clinicName || 'Nao informado',
                    technicianName: exam.technicianName || '',
                    status: 'pending' as const,
                    eyerCloudId: exam.eyerCloudId || exam.id,
                    createdAt: exam.createdAt?.toISOString() || new Date().toISOString(),
                    patientId: exam.patientId,
                    images,
                    report: undefined,
                    referral: undefined,
                };
            });

            const latestExamMapped = examsWithImages.length > 0 ? examsWithImages[0] : null;

            // Combine all images from all exams (deduplicated)
            const allImages = (() => {
                const allImgs = examsWithImages.flatMap((exam) => exam.images || []);
                const seenIds = new Set<string>();
                return allImgs.filter((img) => {
                    if (seenIds.has(img.id)) return false;
                    seenIds.add(img.id);
                    return true;
                });
            })();

            return {
                id: p.id,
                name: p.rawName || p.normalizedName || '',
                cpf: p.cpf || p.extractedCpf || undefined,
                birthDate: p.birthDate?.toISOString() || null,
                gender: p.gender || undefined,
                ethnicity: undefined,
                education: undefined,
                occupation: undefined,
                phone: p.phone || undefined,
                underlyingDiseases: p.underlyingDiseases || undefined,
                ophthalmicDiseases: p.ophthalmicDiseases || undefined,
                createdAt: p.createdAt?.toISOString() || new Date().toISOString(),
                exams: examsWithImages,
                // Retrocompatibility
                status: 'pending' as const,
                examDate: latestExamMapped?.examDate || null,
                location: latestExamMapped?.location || p.sourceLogin.clinicName || 'Nao informado',
                technicianName: latestExamMapped?.technicianName || '',
                images: latestExamMapped?.images || [],
                allImages,
                report: null,
                referral: null,
                // Extra staging metadata
                _source: 'staging' as const,
                _clinicName: p.sourceLogin.clinicName,
                _sourceEmail: p.sourceLogin.email,
                _normalizationStatus: p.normalizationStatus,
            } as any;
        });
    } catch (e) {
        console.error('Error fetching staging patients:', e);
        return [];
    }
}

/**
 * Get staging DB summary counts per source.
 */
export async function getStagingStatsAction() {
    await checkAuth();

    try {
        const sources = await prismaStaging.sourceLogin.findMany({
            include: {
                _count: {
                    select: {
                        patients: true,
                        exams: true,
                    },
                },
            },
        });

        const totalImages = await prismaStaging.stagingExamImage.count();

        return {
            sources: sources.map((s) => ({
                email: s.email,
                clinicName: s.clinicName,
                userName: s.userName,
                patients: s._count.patients,
                exams: s._count.exams,
            })),
            totalImages,
        };
    } catch (e) {
        console.error('Error fetching staging stats:', e);
        return { sources: [], totalImages: 0 };
    }
}
