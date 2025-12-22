'use server'

import prisma from '@/lib/prisma';
import { uploadFileToS3, getSignedFileUrl } from '@/lib/s3';
import { Patient, AnalyticsData, PatientImage } from '@/types';
import { revalidatePath } from 'next/cache';

export async function createPatient(formData: FormData) {
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

    const files = formData.getAll('images') as File[];
    const eyerUrls = formData.getAll('eyerUrls') as string[];

    // Create patient in DB
    const patient = await prisma.patient.create({
        data: {
            name,
            cpf,
            birthDate,
            examDate,
            location,
            technicianName,
            gender,
            ethnicity,
            education,
            occupation,
            status: 'pending',
        },
    });

    // Handle images
    if (files.length > 0 && files[0].size > 0) {
        for (const file of files) {
            const buffer = Buffer.from(await file.arrayBuffer());
            const s3Key = await uploadFileToS3(buffer, file.name, file.type);

            await prisma.patientImage.create({
                data: {
                    url: s3Key,
                    fileName: file.name,
                    patientId: patient.id,
                },
            });
        }
    } else if (eyerUrls.length > 0) {
        // For EyeR mock urls (usually we would fetch and re-upload, but here we just store as is or download/upload)
        for (let i = 0; i < eyerUrls.length; i++) {
            // Since these are data URLs in the mock, we can decode and upload to S3
            const dataUrl = eyerUrls[i];
            if (dataUrl.startsWith('data:')) {
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
    const patients = await prisma.patient.findMany({
        include: {
            images: true,
            report: true,
            referral: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    // Convert S3 keys to signed URLs and map back to our Type
    const mappedPatients = await Promise.all(patients.map(async (p: any) => {
        const imagesWithUrls = await Promise.all(p.images.map(async (img: any) => ({
            ...img,
            data: await getSignedFileUrl(img.url),
            uploadedAt: img.uploadedAt.toISOString(),
        })));

        return {
            ...p,
            birthDate: p.birthDate.toISOString(),
            examDate: p.examDate.toISOString(),
            createdAt: p.createdAt.toISOString(),
            images: imagesWithUrls,
            report: p.report ? {
                ...p.report,
                diagnosticConditions: p.report.diagnosticConditions as any,
                completedAt: p.report.completedAt.toISOString(),
            } : undefined,
            referral: p.referral ? {
                ...p.referral,
                referralDate: p.referral.referralDate.toISOString(),
            } : undefined,
        } as any;
    }));

    return mappedPatients;
}

export async function updatePatientAction(id: string, updates: any) {
    // Handle specific updates like report or referral
    if (updates.report) {
        await prisma.medicalReport.upsert({
            where: { patientId: id },
            update: {
                doctorName: updates.report.doctorName,
                findings: updates.report.findings,
                diagnosis: updates.report.diagnosis,
                recommendations: updates.report.recommendations,
                diagnosticConditions: updates.report.diagnosticConditions,
                completedAt: new Date(updates.report.completedAt || undefined),
            },
            create: {
                doctorName: updates.report.doctorName,
                findings: updates.report.findings,
                diagnosis: updates.report.diagnosis,
                recommendations: updates.report.recommendations,
                diagnosticConditions: updates.report.diagnosticConditions,
                patientId: id,
                completedAt: new Date(updates.report.completedAt || undefined),
            }
        });
        delete updates.report;
    }

    if (updates.referral) {
        await prisma.patientReferral.upsert({
            where: { patientId: id },
            update: {
                referredBy: updates.referral.referredBy,
                specialty: updates.referral.specialty,
                urgency: updates.referral.urgency,
                notes: updates.referral.notes,
                specializedService: updates.referral.specializedService,
                outcome: updates.referral.outcome,
                outcomeDate: updates.referral.outcomeDate ? new Date(updates.referral.outcomeDate) : undefined,
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
                status: updates.referral.status,
                patientId: id,
            }
        });
        delete updates.referral;
    }

    await prisma.patient.update({
        where: { id },
        data: updates,
    });

    revalidatePath('/');
    revalidatePath('/results');
    revalidatePath('/medical');
    revalidatePath('/referrals');
    revalidatePath('/analytics');
}

export async function getAnalyticsAction(): Promise<AnalyticsData> {
    const patients = await prisma.patient.findMany({
        include: {
            images: true,
            report: true,
        }
    });

    const todayStr = new Date().toISOString().split('T')[0];

    const totalPatients = patients.length;
    const totalImages = patients.reduce((sum: number, p: any) => sum + p.images.length, 0);
    const pendingReports = patients.filter((p: any) => p.status === 'pending').length;
    const completedReports = patients.filter((p: any) => p.status === 'completed').length;

    const patientsToday = patients.filter((p: any) => p.createdAt.toISOString().split('T')[0] === todayStr).length;
    const imagesToday = patients
        .filter((p: any) => p.createdAt.toISOString().split('T')[0] === todayStr)
        .reduce((sum: number, p: any) => sum + p.images.length, 0);

    // Time calculation
    const completedPatients = patients.filter((p: any) => p.status === 'completed' && p.report);
    const averageProcessingTime = completedPatients.length > 0
        ? completedPatients.reduce((sum: number, p: any) => {
            const created = p.createdAt.getTime();
            const completed = p.report!.completedAt.getTime();
            return sum + (completed - created) / (1000 * 60 * 60);
        }, 0) / completedPatients.length
        : 0;

    // Productivity by region (location)
    const productivityByRegion = patients.reduce((acc: any, p: any) => {
        const region = p.location || 'Não Informado';
        acc[region] = (acc[region] || 0) + 1;
        return acc;
    }, {});

    // Productivity by professional (doctor who completed the report)
    const productivityByProfessional = patients.reduce((acc: any, p: any) => {
        if (p.status === 'completed' && p.report) {
            const doctor = p.report.doctorName;
            acc[doctor] = (acc[doctor] || 0) + 1;
        }
        return acc;
    }, {});

    return {
        totalPatients,
        totalImages,
        pendingReports,
        completedReports,
        patientsToday,
        imagesToday,
        averageProcessingTime: Math.round(averageProcessingTime * 10) / 10,
        productivityByRegion,
        productivityByProfessional,
    } as any;
}
