'use server'

import prisma from '@/lib/prisma';
import { uploadFileToS3, getSignedFileUrl } from '@/lib/s3';
import { Patient, AnalyticsData, PatientImage } from '@/types';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase-server';
import fs from 'fs';
import path from 'path';

async function checkAuth() {
    const supabase = createClient();
    // Using getUser() is more secure for server-side checks
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        throw new Error('Não autorizado');
    }
    return user;
}

export async function createPatient(formData: FormData) {
    await checkAuth();
    const id = formData.get('id') as string;
    const name = formData.get('name') as string;
    const cpf = formData.get('cpf') as string;
    const birthDate = new Date(formData.get('birthDate') as string);
    const examDate = new Date(formData.get('examDate') as string);
    const location = formData.get('location') as string;
    const technicianName = formData.get('technicianName') as string;
    const gender = formData.get('gender') as string;
    const ethnicity = formData.get('ethnicity') as string;
    const education = formData.get('education') as string;
    const occupation = formData.get('occupation') as string;
    const phone = formData.get('phone') as string;

    const underlyingDiseases = formData.get('underlyingDiseases') ? JSON.parse(formData.get('underlyingDiseases') as string) : undefined;
    const ophthalmicDiseases = formData.get('ophthalmicDiseases') ? JSON.parse(formData.get('ophthalmicDiseases') as string) : undefined;

    // Generate a unique CPF if it's missing or duplicate
    let finalCpf = cpf;
    if (!finalCpf || finalCpf === 'PENDENTE' || finalCpf.trim() === '' || finalCpf === 'null') {
        finalCpf = `AUTO-${id || Math.random().toString(36).slice(2, 11)}`;
    }

    // Check if another patient (with different ID) already has this CPF
    // We check this BEFORE the upsert to avoid the Unique Constraint error
    const conflict = await prisma.patient.findFirst({
        where: {
            cpf: finalCpf,
            id: { not: id || 'new-patient' }
        }
    });

    if (conflict) {
        // If there's a conflict, generate a purely unique dummy CPF
        finalCpf = `CONFLICT-${id || ''}-${Math.random().toString(36).slice(2, 7)}`;
    }

    // Upsert patient in DB
    const patient = await prisma.patient.upsert({
        where: { id: id || 'new-patient' },
        update: {
            name,
            cpf: finalCpf,
            birthDate,
            examDate,
            location,
            technicianName,
            gender,
            ethnicity,
            education,
            occupation,
            phone,
            underlyingDiseases,
            ophthalmicDiseases,
        },
        create: {
            id: id || undefined,
            name,
            cpf: finalCpf,
            birthDate,
            examDate,
            location,
            technicianName,
            gender,
            ethnicity,
            education,
            occupation,
            phone,
            underlyingDiseases,
            ophthalmicDiseases,
            status: 'pending',
        },
    });

    const isAwsConfigured = process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_ACCESS_KEY_ID !== 'your-access-key-id' &&
        process.env.AWS_SECRET_ACCESS_KEY !== 'your-secret-access-key';

    const files = formData.getAll('images') as File[];
    const eyerUrls = formData.getAll('eyerUrls') as string[];

    // Handle images
    if (files.length > 0 && files[0].size > 0) {
        for (const file of files) {
            const buffer = Buffer.from(await file.arrayBuffer());
            const fileName = file.name;
            const contentType = file.type;

            let imageUrl = '';
            if (isAwsConfigured) {
                const s3Key = await uploadFileToS3(buffer, fileName, contentType);
                imageUrl = s3Key;
            } else {
                console.warn('[SERVER] AWS not configured, skipping S3 upload for local file');
                // In a real app we'd need a local storage fallback, 
                // but for now we just log it and potentially skip
                continue;
            }

            await prisma.patientImage.create({
                data: {
                    url: imageUrl,
                    fileName: fileName,
                    patientId: patient.id,
                },
            });
        }
    } else if (eyerUrls.length > 0) {
        // For EyeR cloud/mock urls
        for (let i = 0; i < eyerUrls.length; i++) {
            const dataUrl = eyerUrls[i];

            if (dataUrl.startsWith('data:')) {
                // Handle Base64
                if (isAwsConfigured) {
                    const base64 = dataUrl.split(',')[1];
                    const buffer = Buffer.from(base64, 'base64');
                    const mimeMatch = dataUrl.match(/data:([^;]+);/);
                    const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
                    const s3Key = await uploadFileToS3(buffer, `eyer-${i}.jpg`, contentType);

                    await prisma.patientImage.create({
                        data: {
                            url: s3Key,
                            fileName: `eyer-image-${i + 1}.jpg`,
                            patientId: patient.id,
                        },
                    });
                } else {
                    console.warn('[SERVER] AWS not configured, skipping S3 upload for base64 image');
                }
            } else if (dataUrl.startsWith('http')) {
                // Handle Cloud URL
                if (isAwsConfigured) {
                    try {
                        const response = await fetch(dataUrl);
                        if (response.ok) {
                            const arrayBuffer = await response.arrayBuffer();
                            const buffer = Buffer.from(arrayBuffer);
                            const contentType = response.headers.get('content-type') || 'image/jpeg';
                            const fileName = dataUrl.split('/').pop() || `cloud-image-${i}.jpg`;

                            const s3Key = await uploadFileToS3(buffer, fileName, contentType);

                            await prisma.patientImage.create({
                                data: {
                                    url: s3Key,
                                    fileName: fileName,
                                    patientId: patient.id,
                                },
                            });
                        } else {
                            // If S3 configured but fetch failed, we can still store the direct URL
                            throw new Error('Fetch failed');
                        }
                    } catch (fetchErr) {
                        console.error(`[SERVER] Failed to sync to S3, storing direct URL: ${dataUrl}`);
                        await prisma.patientImage.create({
                            data: {
                                url: dataUrl,
                                fileName: dataUrl.split('/').pop() || `cloud-image-${i}.jpg`,
                                patientId: patient.id,
                            },
                        });
                    }
                } else {
                    // AWS NOT CONFIGURED: Save the Bytescale URL directly in the DB!
                    console.log(`[SERVER] AWS not configured, storing direct Bytescale URL: ${dataUrl}`);
                    await prisma.patientImage.create({
                        data: {
                            url: dataUrl,
                            fileName: dataUrl.split('/').pop() || `cloud-image-${i}.jpg`,
                            patientId: patient.id,
                        },
                    });
                }
            }
        }
    }

    revalidatePath('/');
    revalidatePath('/results');
    revalidatePath('/medical');
    revalidatePath('/referrals');
    revalidatePath('/analytics');

    return { success: true, id: patient.id };
}

export async function getPatientsAction() {
    await checkAuth();

    // Busca todos os pacientes com seus exames
    const patients = await prisma.patient.findMany({
        include: {
            exams: {
                include: {
                    images: true,
                    report: true,
                    referral: true,
                },
                orderBy: { examDate: 'desc' },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    const mappedPatients = await Promise.all(patients.map(async (p: any) => {
        try {
            // Mapeia cada exame do paciente
            const examsWithImages = await Promise.all(p.exams.map(async (exam: any) => {
                const imagesWithUrls = await Promise.all((exam.images || []).map(async (img: any) => ({
                    ...img,
                    data: await getSignedFileUrl(img.url),
                    uploadedAt: img.uploadedAt?.toISOString?.() || new Date(img.uploadedAt || Date.now()).toISOString(),
                })));

                return {
                    ...exam,
                    examDate: exam.examDate?.toISOString?.() || new Date(exam.examDate || Date.now()).toISOString(),
                    createdAt: exam.createdAt?.toISOString?.() || new Date(exam.createdAt || Date.now()).toISOString(),
                    images: imagesWithUrls,
                    report: exam.report ? {
                        ...exam.report,
                        diagnosticConditions: exam.report.diagnosticConditions as any,
                        completedAt: exam.report.completedAt?.toISOString?.() || new Date(exam.report.completedAt || Date.now()).toISOString(),
                    } : undefined,
                    referral: exam.referral ? {
                        ...exam.referral,
                        referralDate: exam.referral.referralDate?.toISOString?.() || new Date(exam.referral.referralDate || Date.now()).toISOString(),
                    } : undefined,
                };
            }));

            return {
                ...p,
                birthDate: p.birthDate?.toISOString?.() || null,
                createdAt: p.createdAt?.toISOString?.() || new Date(p.createdAt || Date.now()).toISOString(),
                exams: examsWithImages,
            } as any;
        } catch (e) {
            console.error('Error mapping patient:', p.id, e);
            return {
                ...p,
                birthDate: String(p.birthDate || ''),
                createdAt: String(p.createdAt),
                exams: [],
            } as any;
        }
    }));

    return mappedPatients;
}

// Atualiza um exame específico (por examId) - usado para laudos e encaminhamentos
export async function updateExamAction(examId: string, updates: any) {
    await checkAuth();

    // Handle report update
    if (updates.report) {
        await prisma.medicalReport.upsert({
            where: { examId: examId },
            update: {
                doctorName: updates.report.doctorName,
                doctorCRM: updates.report.doctorCRM,
                findings: updates.report.findings,
                diagnosis: updates.report.diagnosis,
                recommendations: updates.report.recommendations,
                suggestedConduct: updates.report.suggestedConduct,
                diagnosticConditions: updates.report.diagnosticConditions,
                selectedImages: updates.report.selectedImages,
                completedAt: new Date(updates.report.completedAt || undefined),
            },
            create: {
                doctorName: updates.report.doctorName,
                doctorCRM: updates.report.doctorCRM,
                findings: updates.report.findings,
                diagnosis: updates.report.diagnosis,
                recommendations: updates.report.recommendations,
                suggestedConduct: updates.report.suggestedConduct,
                diagnosticConditions: updates.report.diagnosticConditions,
                selectedImages: updates.report.selectedImages,
                examId: examId,
                completedAt: new Date(updates.report.completedAt || undefined),
            }
        });
        delete updates.report;
    }

    // Handle referral update
    if (updates.referral) {
        await prisma.patientReferral.upsert({
            where: { examId: examId },
            update: {
                referredBy: updates.referral.referredBy,
                specialty: updates.referral.specialty,
                urgency: updates.referral.urgency,
                notes: updates.referral.notes,
                specializedService: updates.referral.specializedService,
                outcome: updates.referral.outcome,
                outcomeDate: updates.referral.outcomeDate ? new Date(updates.referral.outcomeDate) : undefined,
                scheduledDate: updates.referral.scheduledDate ? new Date(updates.referral.scheduledDate) : undefined,
                status: updates.referral.status,
            },
            create: {
                referredBy: updates.referral.referredBy,
                specialty: updates.referral.specialty,
                urgency: updates.referral.urgency,
                notes: updates.referral.notes,
                specializedService: updates.referral.specializedService,
                outcome: updates.referral.outcome,
                outcomeDate: updates.referral.outcomeDate ? new Date(updates.referral.outcomeDate) : undefined,
                scheduledDate: updates.referral.scheduledDate ? new Date(updates.referral.scheduledDate) : undefined,
                status: updates.referral.status,
                examId: examId,
            }
        });
        delete updates.referral;
    }

    // Update exam status if provided
    if (updates.status) {
        await prisma.exam.update({
            where: { id: examId },
            data: { status: updates.status },
        });
    }

    revalidatePath('/');
    revalidatePath('/results');
    revalidatePath('/medical');
    revalidatePath('/referrals');
    revalidatePath('/analytics');
}

// Mantém compatibilidade com código antigo - redireciona para updateExamAction
export async function updatePatientAction(id: string, updates: any) {
    // O id passado é na verdade o examId no novo modelo
    return updateExamAction(id, updates);
}

export async function getAnalyticsAction(): Promise<AnalyticsData> {
    await checkAuth();

    // Busca todos os exames com imagens e reports
    const exams = await prisma.exam.findMany({
        include: {
            images: true,
            report: true,
            patient: true,
        }
    });

    // Conta pacientes únicos
    const uniquePatientIds = new Set(exams.map((e: any) => e.patientId));

    const todayStr = new Date().toISOString().split('T')[0];

    const totalPatients = uniquePatientIds.size;
    const totalExams = exams.length;
    const totalImages = exams.reduce((sum: number, e: any) => sum + e.images.length, 0);
    const pendingReports = exams.filter((e: any) => e.status === 'pending').length;
    const completedReports = exams.filter((e: any) => e.status === 'completed').length;

    const examsToday = exams.filter((e: any) => e.createdAt.toISOString().split('T')[0] === todayStr).length;
    const imagesToday = exams
        .filter((e: any) => e.createdAt.toISOString().split('T')[0] === todayStr)
        .reduce((sum: number, e: any) => sum + e.images.length, 0);

    // Time calculation
    const completedExams = exams.filter((e: any) => e.status === 'completed' && e.report);
    const averageProcessingTime = completedExams.length > 0
        ? completedExams.reduce((sum: number, e: any) => {
            const created = e.createdAt.getTime();
            const completed = e.report!.completedAt.getTime();
            return sum + (completed - created) / (1000 * 60 * 60);
        }, 0) / completedExams.length
        : 0;

    // Productivity by region (location)
    const productivityByRegion = exams.reduce((acc: any, e: any) => {
        const region = e.location || 'Não Informado';
        acc[region] = (acc[region] || 0) + 1;
        return acc;
    }, {});

    // Productivity by professional (doctor who completed the report)
    const productivityByProfessional = exams.reduce((acc: any, e: any) => {
        if (e.status === 'completed' && e.report) {
            const doctor = e.report.doctorName;
            acc[doctor] = (acc[doctor] || 0) + 1;
        }
        return acc;
    }, {});

    return {
        totalPatients,
        totalExams,
        totalImages,
        pendingReports,
        completedReports,
        patientsToday: 0, // Seria necessário contar pacientes criados hoje
        examsToday,
        imagesToday,
        averageProcessingTime: Math.round(averageProcessingTime * 10) / 10,
        productivityByRegion,
        productivityByProfessional,
    } as any;
}

export async function getCloudMappingAction() {
    console.log('[SERVER] getCloudMappingAction called');
    try {
        const user = await checkAuth();
        console.log('[SERVER] Auth success for:', user.email);
    } catch (authError: any) {
        console.warn('[SERVER] Auth check failed:', authError.message);
    }

    try {
        const rootPath = process.cwd();
        // Extensive list of paths to try in production/Railway
        const pathsToTry = [
            path.join(rootPath, 'bytescale_mapping.json'),
            path.join(rootPath, 'public', 'bytescale_mapping.json'),
            path.join(rootPath, '.next', 'server', 'bytescale_mapping.json'),
            path.resolve('bytescale_mapping.json'),
            '/app/bytescale_mapping.json', // Docker/Railway default root
            path.join(rootPath, '..', 'bytescale_mapping.json')
        ];

        let foundPath = null;
        for (const p of pathsToTry) {
            try {
                if (fs.existsSync(p)) {
                    foundPath = p;
                    console.log('[SERVER] Found file at:', p);
                    break;
                }
            } catch (e) { }
        }

        if (!foundPath) {
            console.error('[SERVER] FILE NOT FOUND. Listing root directory for diagnosis...');
            try {
                const files = fs.readdirSync(rootPath);
                console.log('[SERVER] Files at Root:', files.join(', '));

                // One more crazy attempt: look for it recursively in common dirs
                const publicDir = path.join(rootPath, 'public');
                if (fs.existsSync(publicDir)) {
                    const pubFiles = fs.readdirSync(publicDir);
                    console.log('[SERVER] Files in Public:', pubFiles.join(', '));
                }
            } catch (e) { }
            return null;
        }
        console.log('[SERVER] Reading mapping from:', foundPath);
        const content = fs.readFileSync(foundPath, 'utf8');
        if (!content || content.trim() === '') {
            console.error('[SERVER] File is empty!');
            return null;
        }

        const data = JSON.parse(content);
        const entries = Object.entries(data);
        console.log('[SERVER] Success! Entries found:', entries.length);

        // Return a clean, shallow object to ensure perfect serialization
        const cleanData: any = {};
        entries.forEach(([key, val]) => {
            cleanData[key] = val;
        });

        return cleanData;
    } catch (error) {
        console.error('[SERVER] Fatal error in getCloudMappingAction:', error);
        return null;
    }
}
