'use client';

import { useEffect, useState } from 'react';
import { Users, Image as LucideImage, Clock, CheckCircle2, TrendingUp, TrendingDown, Activity, RefreshCw } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getAnalyticsAction, getPatientsAction } from '@/app/actions/patients';
import { AnalyticsData } from '@/types';

export default function Analytics() {
  const [stats, setStats] = useState<AnalyticsData>({
    totalPatients: 0,
    totalImages: 0,
    pendingReports: 0,
    completedReports: 0,
    patientsToday: 0,
    imagesToday: 0,
    averageProcessingTime: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [analyticsData, patients] = await Promise.all([
        getAnalyticsAction(),
        getPatientsAction()
      ]);
      setStats(analyticsData);

      const recent = (patients as any[])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
      setRecentActivity(recent);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-sandstone-50/30">
      <div className="noise-overlay" />
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="stagger-load space-y-12">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="accent-line" />
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal mb-4 leading-tight">
                Painel de <span className="text-cardinal-700 italic">Analytics</span>
              </h1>
              <p className="text-lg text-sandstone-600 font-medium">
                Métricas de desempenho e fluxo operacional em tempo real.
              </p>
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center space-x-2 px-6 py-3 bg-white border border-sandstone-200 rounded-xl text-sm font-bold uppercase tracking-widest text-sandstone-600 hover:text-cardinal-700 hover:border-cardinal-200 transition-all shadow-sm hover:shadow-md"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Sincronizando...' : 'Atualizar Dados'}</span>
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <StatCard
              title="Total de Pacientes"
              value={stats.totalPatients}
              icon={Users}
              trend="+12%"
              trendUp={true}
              detail={`${stats.patientsToday} hoje`}
            />
            <StatCard
              title="Imagens Processadas"
              value={stats.totalImages}
              icon={LucideImage}
              trend="+5%"
              trendUp={true}
              detail={`${stats.imagesToday} hoje`}
            />
            <StatCard
              title="Tempo Médio"
              value={`${stats.averageProcessingTime}h`}
              icon={Clock}
              trend="-15%"
              trendUp={true} // For time, down is good
              detail="Desde o registro"
            />
            <StatCard
              title="Laudos Concluídos"
              value={stats.completedReports}
              icon={CheckCircle2}
              trend={`${Math.round((stats.completedReports / (stats.totalPatients || 1)) * 100)}%`}
              trendUp={true}
              detail={`${stats.pendingReports} pendentes`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Chart Placeholder / Recent Activity */}
            <div className="lg:col-span-2 space-y-8">
              <div className="premium-card p-10 bg-white">
                <div className="flex items-center justify-between mb-10">
                  <div>
                    <h3 className="text-2xl font-serif font-bold text-charcoal mb-1 italic">Fluxo de Triagem</h3>
                    <p className="text-sm font-medium text-sandstone-400">Volume de atendimentos vs Capacidade de análise</p>
                  </div>
                  <div className="flex space-x-3">
                    <span className="flex items-center text-[10px] font-bold uppercase tracking-widest text-cardinal-700">
                      <div className="w-2 h-2 bg-cardinal-700 rounded-full mr-2" /> Registros
                    </span>
                    <span className="flex items-center text-[10px] font-bold uppercase tracking-widest text-sandstone-300">
                      <div className="w-2 h-2 bg-sandstone-200 rounded-full mr-2" /> Laudos
                    </span>
                  </div>
                </div>

                {/* Mock Chart Visualization */}
                <div className="h-64 flex items-end justify-between gap-2">
                  {[45, 62, 58, 75, 90, 85, 95].map((val, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center group">
                      <div className="w-full bg-sandstone-50 rounded-t-lg relative overflow-hidden h-full flex items-end">
                        <div
                          className="w-full bg-cardinal-700/10 group-hover:bg-cardinal-700/20 transition-all rounded-t-lg"
                          style={{ height: `${val}%` }}
                        />
                        <div
                          className="absolute bottom-0 w-full bg-cardinal-700 transition-all"
                          style={{ height: `${val * 0.7}%` }}
                        />
                      </div>
                      <span className="mt-4 text-[10px] font-bold text-sandstone-400 uppercase tracking-tighter">
                        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'][i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quality Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="premium-card p-8 bg-charcoal text-white">
                  <div className="flex items-start justify-between mb-6">
                    <div className="p-3 bg-white/10 rounded-xl">
                      <Activity className="w-6 h-6 text-cardinal-400" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-cardinal-400 px-3 py-1 bg-white/5 rounded-full border border-white/10">SLA Global</span>
                  </div>
                  <h4 className="text-4xl font-serif font-bold mb-2">98.4%</h4>
                  <p className="text-sm font-medium text-sandstone-400 leading-relaxed uppercase tracking-wider">Eficiência de Resposta dentro de 24h</p>
                </div>

                <div className="premium-card p-8 bg-cardinal-700 text-white">
                  <div className="flex items-start justify-between mb-6">
                    <div className="p-3 bg-white/10 rounded-xl">
                      <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/60 px-3 py-1 bg-white/5 rounded-full border border-white/10">KPI Mensal</span>
                  </div>
                  <h4 className="text-4xl font-serif font-bold mb-2">+240</h4>
                  <p className="text-sm font-medium text-white/70 leading-relaxed uppercase tracking-wider">Novos diagnósticos processados este mês</p>
                </div>
              </div>
            </div>

            {/* Recent Activity Sidenav */}
            <div className="space-y-8">
              <h3 className="text-xl font-serif font-bold text-charcoal border-b border-sandstone-200 pb-4 italic flex items-center">
                Atividade <span className="text-cardinal-700 ml-2">Recente</span>
              </h3>
              <div className="space-y-6">
                {recentActivity.length === 0 ? (
                  <p className="text-sm text-sandstone-400 italic">Nenhum registro recente.</p>
                ) : (
                  recentActivity.map((patient) => (
                    <div key={patient.id} className="flex items-start space-x-4 group cursor-pointer">
                      <div className="mt-1 w-2 h-2 rounded-full bg-cardinal-700 ring-4 ring-cardinal-50 group-hover:scale-125 transition-transform" />
                      <div>
                        <p className="text-sm font-bold text-charcoal group-hover:text-cardinal-700 transition-colors uppercase tracking-tight">{patient.name}</p>
                        <p className="text-[10px] font-medium text-sandstone-400 uppercase tracking-widest mb-1">{patient.location}</p>
                        <div className="flex items-center text-[10px] font-bold text-sandstone-300">
                          <Clock className="w-3 h-3 mr-1" />
                          {formatFullDate(patient.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="premium-card p-6 bg-sandstone-100/50 border-dashed">
                <h4 className="text-xs font-bold uppercase tracking-wider text-charcoal mb-4">Produtividade por Região</h4>
                <div className="space-y-4">
                  {stats.productivityByRegion && Object.keys(stats.productivityByRegion).length > 0 ? (
                    Object.entries(stats.productivityByRegion).map(([region, count], i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold uppercase text-sandstone-500">
                          <span>{region}</span>
                          <span>{count} exames</span>
                        </div>
                        <div className="h-1 bg-sandstone-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cardinal-700"
                            style={{ width: `${Math.min((count as number / (stats.totalPatients || 1)) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-sandstone-400 italic">Sem dados de região.</p>
                  )}
                </div>
              </div>

              <div className="premium-card p-6 bg-white shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-charcoal mb-4">Top Profissionais</h4>
                <div className="space-y-4">
                  {stats.productivityByProfessional && Object.keys(stats.productivityByProfessional).length > 0 ? (
                    Object.entries(stats.productivityByProfessional)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .slice(0, 5)
                      .map(([doctor, count], i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-cardinal-50 flex items-center justify-center text-[10px] font-bold text-cardinal-700">
                              {doctor.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-charcoal uppercase">{doctor}</p>
                              <p className="text-[9px] text-sandstone-400 uppercase tracking-tighter">Médico Analista</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-cardinal-700 bg-cardinal-50 px-2 py-0.5 rounded-full">
                            {count} laudos
                          </span>
                        </div>
                      ))
                  ) : (
                    <p className="text-[10px] text-sandstone-400 italic">Sem dados de produtividade.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, trendUp, detail }: any) {
  return (
    <div className="premium-card p-8 group hover:translate-y-[-4px] transition-all duration-500">
      <div className="flex items-start justify-between mb-6">
        <div className="p-4 bg-sandstone-50 rounded-2xl text-cardinal-700 group-hover:bg-cardinal-700 group-hover:text-white transition-colors duration-500 shadow-sm">
          <Icon className="w-6 h-6" />
        </div>
        <div className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${trendUp ? 'bg-green-50 text-green-700' : 'bg-cardinal-50 text-cardinal-700'}`}>
          {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{trend}</span>
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-[0.2em] mb-1">{title}</p>
        <h3 className="text-4xl font-serif font-bold text-charcoal mb-2">{value}</h3>
        <p className="text-xs font-medium text-sandstone-500 italic">{detail}</p>
      </div>
    </div>
  );
}
