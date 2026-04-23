import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api, { BASE_URL } from '../api/axios';
import { ClipboardList, BookOpen, LogOut, CheckCircle, XCircle, Download, Upload, FileText, Calendar, User as UserIcon, Trash2, MessageCircle, Send, Award, MessageSquare, BarChart as BarChartIcon, Lock, Unlock, ShieldAlert, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [attendance, setAttendance] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionAttendance, setSessionAttendance] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [doubts, setDoubts] = useState<any[]>([]);
  const [newDoubt, setNewDoubt] = useState('');
  const [replyContent, setReplyContent] = useState<{ [key: number]: string }>({});
  const [studentSubmissions, setStudentSubmissions] = useState<any[]>([]);
  const [newAssignment, setNewAssignment] = useState({ title: '', description: '', due_date: '' });
  const [assignmentFile, setAssignmentFile] = useState<File | null>(null);
  const [submissionFile, setSubmissionFile] = useState<{ [key: number]: File | null }>({});
  const [submissionContent, setSubmissionContent] = useState<{ [key: number]: string }>({});
  const [grading, setGrading] = useState<{ [key: number]: { grade: string, feedback: string } }>({});
  const [plagiarismReport, setPlagiarismReport] = useState<any[]>([]);
  const [checkingPlagiarism, setCheckingPlagiarism] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'attendance' | 'assignments' | 'submissions' | 'doubts' | 'plagiarism' | 'profile'>('attendance');
  const [currentAssignmentId, setCurrentAssignmentId] = useState<number | null>(null);
  const [profile, setProfile] = useState({ enrollment_number: '', branch: '', semester: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  const getAssignmentFileUrl = (assignmentId: number) => `${BASE_URL}/files/assignments/${assignmentId}`;
  const getSubmissionFileUrl = (submissionId: number) => `${BASE_URL}/files/submissions/${submissionId}`;

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchData();
    if (user?.role === 'student') {
      fetchProfile();
    }
  }, [user]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).replace(',', '');
  };

  const fetchProfile = async () => {
    try {
      const res = await api.get('/profile');
      setProfile({
        enrollment_number: res.data.enrollment_number || '',
        branch: res.data.branch || '',
        semester: res.data.semester || ''
      });
    } catch (err) {
      console.error('Failed to fetch profile');
    }
  };

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch('/profile', profile);
      alert('Profile updated successfully');
      setSavingProfile(false);
    } catch (err) {
      alert('Failed to update profile');
      setSavingProfile(false);
    }
  };

  const fetchData = async () => {
    try {
      const attRoute = user?.role === 'teacher' ? '/attendance/teacher' : '/attendance/student';
      const requests = [
        api.get(attRoute),
        api.get('/assignments'),
        api.get('/doubts'),
        api.get('/sessions')
      ];
      
      if (user?.role === 'student') {
        requests.push(api.get('/submissions/student'));
      } else if (user?.role === 'teacher' && currentAssignmentId) {
        requests.push(api.get(`/submissions/${currentAssignmentId}`));
      }

      const results = await Promise.all(requests);
      setAttendance(results[0].data);
      setAssignments(results[1].data);
      setDoubts(results[2].data);
      setSessions(results[3].data);
      
      if (user?.role === 'student') {
        setStudentSubmissions(results[4].data);
      } else if (user?.role === 'teacher' && currentAssignmentId && results[4]) {
        setSubmissions(results[4].data);
        const gradingState: { [key: number]: { grade: string, feedback: string } } = {};
        results[4].data.forEach((sub: any) => {
          gradingState[sub.id] = { grade: sub.grade || '', feedback: sub.feedback || '' };
        });
        setGrading(gradingState);
      }
      
      setLoading(false);
      return results[0].data; // Return attendance data
    } catch (err) {
      console.error(err);
      setLoading(false);
      return [];
    }
  };

  const createSession = async (title: string) => {
    try {
      await api.post('/sessions', { title, date: new Date().toISOString().split('T')[0] });
      fetchData();
    } catch (err) {
      alert('Failed to create session');
    }
  };

  const viewSessionAttendance = async (session: any) => {
    try {
      const res = await api.get(`/sessions/${session.id}/attendance`);
      setSessionAttendance(res.data);
      setSelectedSession(session);
    } catch (err) {
      alert('Failed to fetch session attendance');
    }
  };

  const toggleSession = async (sessionId: number, currentStatus: number) => {
    try {
      await api.patch(`/sessions/${sessionId}/toggle`, { is_open: !currentStatus });
      fetchData();
    } catch (err) {
      alert('Failed to toggle attendance status');
    }
  };

  const postDoubt = async (e: React.FormEvent, parentId?: number) => {
    e.preventDefault();
    const content = parentId ? replyContent[parentId] : newDoubt;
    if (!content || !content.trim()) return;
    
    try {
      await api.post('/doubts', { content, parent_id: parentId });
      if (parentId) {
        setReplyContent({ ...replyContent, [parentId]: '' });
      } else {
        setNewDoubt('');
      }
      fetchData();
    } catch (err) {
      alert('Failed to post doubt');
    }
  };

  const deleteDoubt = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this doubt?')) return;
    try {
      await api.delete(`/doubts/${id}`);
      fetchData();
    } catch (err) {
      alert('Failed to delete doubt');
    }
  };

  const fetchSubmissions = async (assignmentId: number) => {
    try {
      const response = await api.get(`/submissions/${assignmentId}`);
      setSubmissions(response.data);
      setCurrentAssignmentId(assignmentId);
      
      const gradingState: { [key: number]: { grade: string, feedback: string } } = {};
      response.data.forEach((sub: any) => {
        gradingState[sub.id] = { grade: sub.grade || '', feedback: sub.feedback || '' };
      });
      setGrading(gradingState);
      
      setActiveTab('submissions');
    } catch (err) {
      alert('Failed to fetch submissions');
    }
  };

  const submitGrade = async (submissionId: number) => {
    const { grade, feedback } = grading[submissionId];
    try {
      await api.post(`/submissions/${submissionId}/grade`, { grade, feedback });
      alert('Grade updated successfully');
      if (currentAssignmentId) fetchSubmissions(currentAssignmentId);
    } catch (err) {
      alert('Failed to update grade');
    }
  };

  const checkPlagiarism = async (assignmentId: number) => {
    if (submissions.length < 1) {
      alert('At least one submission is required to check for plagiarism.');
      return;
    }
    setCheckingPlagiarism(true);
    try {
      const response = await api.get(`/submissions/${assignmentId}/plagiarism`);
      setPlagiarismReport(response.data);
      setCheckingPlagiarism(false);
      
      if (response.data.length === 0) {
        alert('Plagiarism scan complete! No significant similarities found.');
      } else {
        alert('Plagiarism scan complete! Similarity percentages are now displayed on each submission card.');
      }
    } catch (err) {
      alert('Failed to check plagiarism');
      setCheckingPlagiarism(false);
    }
  };

  const getSimilarityForStudent = (studentName: string) => {
    if (!plagiarismReport) return null; // Not scanned yet
    if (submissions.length < 1) return null; // No students
    if (plagiarismReport.length === 0) return 0; // Scanned but no similarity
    
    const matches = plagiarismReport.filter(r => r.student1 === studentName || r.student2 === studentName);
    if (matches.length === 0) return 0;
    return Math.max(...matches.map(m => Number(m.score)));
  };

  const markAttendance = async (status: 'present' | 'absent', sessionId?: number) => {
    try {
      await api.post('/attendance', {
        date: new Date().toISOString().split('T')[0],
        status,
        session_id: sessionId
      });
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to mark attendance');
    }
  };

  const postAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('title', newAssignment.title);
    formData.append('description', newAssignment.description);
    formData.append('due_date', newAssignment.due_date);
    if (assignmentFile) {
      formData.append('file', assignmentFile);
    }

    try {
      await api.post('/assignments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setNewAssignment({ title: '', description: '', due_date: '' });
      setAssignmentFile(null);
      fetchData();
    } catch (err) {
      alert('Failed to post assignment');
    }
  };

  const deleteAssignment = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this assignment? All submissions will also be deleted.')) return;
    try {
      await api.delete(`/assignments/${id}`);
      fetchData();
    } catch (err) {
      alert('Failed to delete assignment');
    }
  };

  const submitAssignment = async (assignmentId: number) => {
    const content = submissionContent[assignmentId];
    const file = submissionFile[assignmentId];
    if (!content && !file) return alert('Please enter some content or upload a file');
    
    const formData = new FormData();
    formData.append('assignment_id', assignmentId.toString());
    formData.append('content', content || '');
    if (file) {
      formData.append('file', file);
    }

    try {
      await api.post('/submissions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSubmissionContent({ ...submissionContent, [assignmentId]: '' });
      setSubmissionFile({ ...submissionFile, [assignmentId]: null });
      alert('Assignment submitted successfully');
      fetchData(); // Add this line
    } catch (err) {
      alert('Failed to submit assignment');
    }
  };

  const downloadAttendance = async (format: 'csv' | 'txt' = 'csv') => {
    // Refresh data first to ensure we have the latest student profile info
    const latestAttendance = await fetchData();
    
    // Only include attendance records that are linked to a session
    const validAttendance = latestAttendance.filter((r: any) => !!r.session_title);
    
    const header = "Student Name,Enrollment Number,Branch,Semester,Class Title,Date,Status\n";
    const rows = validAttendance.map((r: any) => `${r.student_name || user?.name},${r.enrollment_number || ''},${r.branch || ''},${r.semester || ''},${r.session_title},${r.date},${r.status}`).join("\n");
    
    const content = header + rows;
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance_record.${format}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- ATTENDANCE STATS CALCULATION ---
  const getAttendanceStats = () => {
    // Only count attendance records that are linked to a session
    const validAttendance = attendance.filter(r => !!r.session_title);

    if (user?.role === 'student') {
      const present = validAttendance.filter(r => r.status === 'present').length;
      const totalClasses = sessions.length;
      const absent = totalClasses - present; // If not present, marked as absent or just not marked
      const percentage = totalClasses > 0 ? ((present / totalClasses) * 100).toFixed(1) : 0;
      
      return {
        data: [
          { name: 'Present', value: present, color: '#4ade80' },
          { name: 'Absent', value: Math.max(0, absent), color: '#f87171' }
        ],
        percentage,
        total: totalClasses
      };
    } else {
      // Group attendance by student for teacher view
      const studentMap: { [key: string]: { present: number, absent: number } } = {};
      
      validAttendance.forEach(r => {
        if (!studentMap[r.student_name]) {
          studentMap[r.student_name] = { present: 0, absent: 0 };
        }
        if (r.status === 'present') studentMap[r.student_name].present++;
        else studentMap[r.student_name].absent++;
      });

      const barData = Object.keys(studentMap).map(name => {
        const total = sessions.length;
        return {
          name: name.split(' ')[0],
          full_name: name,
          Present: studentMap[name].present,
          Absent: Math.max(0, total - studentMap[name].present),
          Percentage: total > 0 ? (studentMap[name].present / total) * 100 : 0
        };
      });

      return { barData, totalSessions: sessions.length };
    }
  };

  const stats = getAttendanceStats();

  if (loading) return <div className="text-center mt-10 text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-blue-400">Dashboard</h1>
            <p className="text-gray-400 mt-1 flex items-center gap-2">
              Welcome, <span className="text-blue-300 font-semibold">{user?.name}</span> 
              <span className="bg-blue-900/50 text-blue-300 text-xs px-2 py-0.5 rounded-full capitalize border border-blue-700">{user?.role}</span>
            </p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-5 py-2 rounded-xl transition-all border border-red-600/50"
          >
            <LogOut size={18} /> Logout
          </button>
        </header>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-6 bg-gray-800 p-1 rounded-xl border border-gray-700 w-fit">
          <button 
            onClick={() => setActiveTab('attendance')}
            className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'attendance' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-gray-700 text-gray-400'}`}
          >
            Attendance
          </button>
          <button 
             onClick={() => setActiveTab('assignments')}
             className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'assignments' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-gray-700 text-gray-400'}`}
           >
             Assignments
           </button>
           <button 
             onClick={() => setActiveTab('doubts')}
             className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'doubts' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-gray-700 text-gray-400'}`}
           >
             Doubt Section
           </button>
           {user?.role === 'student' && (
             <button 
               onClick={() => setActiveTab('profile')}
               className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'profile' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-gray-700 text-gray-400'}`}
             >
               Profile
             </button>
           )}
           {user?.role === 'teacher' && activeTab === 'submissions' && (
            <button 
              className="px-4 py-2 rounded-lg bg-blue-600 text-white shadow-lg"
            >
              Submissions
            </button>
          )}
          {user?.role === 'teacher' && activeTab === 'plagiarism' && (
            <button 
              className="px-4 py-2 rounded-lg bg-red-600 text-white shadow-lg"
            >
              Plagiarism Report
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-8">
          {activeTab === 'attendance' && (
            <section className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <ClipboardList className="text-green-400" />
                  </div>
                  <h2 className="text-2xl font-bold">Attendance Record</h2>
                </div>
                <div className="flex items-center gap-3">
                  {user?.role === 'teacher' && (
                    <div className="hidden md:flex bg-gray-700/50 px-4 py-2 rounded-xl border border-gray-600 items-center gap-2">
                      <span className="text-[10px] text-gray-500 uppercase font-bold">Total Sessions</span>
                      <span className="text-lg font-bold text-blue-400">{(stats as any).totalSessions}</span>
                    </div>
                  )}
                  {user?.role === 'teacher' && (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => downloadAttendance('csv')}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition text-sm font-semibold"
                        title="Open in Excel / Sheets"
                      >
                        <Download size={16} /> Export CSV
                      </button>
                      <button 
                        onClick={() => downloadAttendance('txt')}
                        className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition text-sm font-semibold"
                        title="Open in VS Code / Notepad"
                      >
                        <FileText size={16} /> Export TXT
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Attendance Analytics Section - Only for Students now */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {user?.role === 'student' && (
                  <>
                    <div className="lg:col-span-1 bg-gray-700/30 p-6 rounded-2xl border border-gray-600 flex flex-col items-center justify-center">
                      <div className="w-full h-48 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={(stats as any).data}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {(stats as any).data.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pt-2">
                          <span className="text-3xl font-bold text-blue-400">{(stats as any).percentage}%</span>
                          <span className="text-[10px] text-gray-500 uppercase font-bold">Attendance</span>
                        </div>
                      </div>
                      <div className="flex gap-4 mt-4 text-xs font-bold uppercase tracking-wider">
                        <div className="flex items-center gap-1.5 text-green-400">
                          <div className="w-2 h-2 rounded-full bg-green-400"></div> Present
                        </div>
                        <div className="flex items-center gap-1.5 text-red-400">
                          <div className="w-2 h-2 rounded-full bg-red-400"></div> Absent
                        </div>
                      </div>
                    </div>
                    <div className="lg:col-span-2 bg-gray-700/30 p-6 rounded-2xl border border-gray-600">
                      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <ClipboardList size={16} className="text-blue-400" /> Class-wise Summary
                      </h3>
                      <div className="overflow-hidden">
                        <div className="max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                          <div className="space-y-2">
                            {sessions.map(session => {
                              const record = attendance.find(r => r.session_id === session.id);
                              const isMarked = !!record;
                              return (
                                <div key={session.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-800/50 border border-gray-700/50 hover:border-blue-500/20 transition-all">
                                  <div className="flex items-center gap-3">
                                    <div className={`p-1.5 rounded-lg ${isMarked ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                      {isMarked ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                    </div>
                                    <div>
                                      <span className="text-xs font-bold text-gray-200 block">{session.title}</span>
                                      <span className="text-[9px] text-gray-500">{formatDate(session.date).split(' ')[0]}</span>
                                    </div>
                                  </div>
                                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                                    isMarked ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'
                                  }`}>
                                    {isMarked ? 'Marked' : 'Not Marked'}
                                  </span>
                                </div>
                              );
                            })}
                            {sessions.length === 0 && (
                              <p className="text-center text-gray-500 text-xs py-8 italic">No class sessions scheduled yet.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {user?.role === 'student' && (
                <div className="mb-8 p-6 bg-blue-600/5 rounded-2xl border border-blue-500/20">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Calendar size={18} className="text-blue-400" /> Available Classes Today
                  </h3>
                  <div className="space-y-4">
                    {sessions.filter(s => s.date === new Date().toISOString().split('T')[0]).map(session => {
                      const isMarked = attendance.some(a => a.session_id === session.id);
                      const isOpen = session.is_open === 1;

                      return (
                        <div key={session.id} className={`p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4 border transition-all ${
                          isOpen ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-800/30 border-gray-700 opacity-60'
                        }`}>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-100">{session.title}</span>
                              {!isOpen && <span className="text-[10px] bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full border border-red-800/50 flex items-center gap-1"><Lock size={10}/> Closed</span>}
                            </div>
                            <span className="text-xs text-gray-500 block">Teacher: {session.teacher_name}</span>
                          </div>
                          {isMarked ? (
                            <span className="flex items-center gap-2 text-green-400 font-bold text-sm bg-green-900/20 px-4 py-2 rounded-lg border border-green-500/20">
                              <CheckCircle size={16} /> Attendance Marked
                            </span>
                          ) : isOpen ? (
                            <div className="flex gap-2 w-full md:w-auto">
                              <button
                                onClick={() => markAttendance('present', session.id)}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold transition flex items-center justify-center gap-2"
                              >
                                <CheckCircle size={16} /> Mark Present
                              </button>
                              <button
                                onClick={() => markAttendance('absent', session.id)}
                                className="flex-1 bg-gray-600 hover:bg-red-600/20 text-gray-300 px-4 py-2 rounded-lg font-bold border border-gray-500 hover:border-red-600/50 transition flex items-center justify-center gap-2"
                              >
                                <XCircle size={16} /> Mark Absent
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500 italic flex items-center gap-1">
                              <Lock size={12}/> Attendance window closed
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {sessions.filter(s => s.date === new Date().toISOString().split('T')[0]).length === 0 && (
                      <p className="text-center text-gray-500 py-4 italic">No classes scheduled for today yet.</p>
                    )}
                  </div>
                </div>
              )}

              {user?.role === 'teacher' && (
                <div className="mb-8 bg-blue-600/5 p-6 rounded-2xl border border-blue-500/20">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Calendar size={18} className="text-blue-400" /> Conduct a New Class
                  </h3>
                  <div className="flex flex-col md:flex-row gap-4">
                    <input 
                      type="text" 
                      placeholder="Class Title (e.g. Physics Lecture 10)"
                      id="sessionTitle"
                      className="flex-1 bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                    <button 
                      onClick={() => {
                        const input = document.getElementById('sessionTitle') as HTMLInputElement;
                        if (input.value) {
                          createSession(input.value);
                          input.value = '';
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20"
                    >
                      Start Class Session
                    </button>
                  </div>
                </div>
              )}

              {user?.role === 'teacher' && (
                <div className="mb-8">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Past Class Sessions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sessions.map(session => (
                      <div
                        key={session.id}
                        className={`p-4 rounded-xl border transition-all flex flex-col gap-3 ${
                          selectedSession?.id === session.id 
                            ? 'bg-blue-600/20 border-blue-500 ring-1 ring-blue-500' 
                            : 'bg-gray-700/50 border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <button 
                            onClick={() => viewSessionAttendance(session)}
                            className="text-left flex-1 group"
                          >
                            <span className="font-bold text-gray-100 block group-hover:text-blue-300 transition-colors">{session.title}</span>
                            <span className="text-[10px] bg-gray-800 px-2 py-0.5 rounded text-gray-400 mt-1 inline-block">{session.date}</span>
                          </button>
                          <button
                            onClick={() => toggleSession(session.id, session.is_open)}
                            className={`p-2 rounded-lg transition-all border ${
                              session.is_open === 1 
                                ? 'bg-green-600/10 border-green-600/30 text-green-500 hover:bg-green-600 hover:text-white' 
                                : 'bg-red-600/10 border-red-600/30 text-red-500 hover:bg-red-600 hover:text-white'
                            }`}
                            title={session.is_open === 1 ? "Close Attendance" : "Open Attendance"}
                          >
                            {session.is_open === 1 ? <Unlock size={14} /> : <Lock size={14} />}
                          </button>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-600/30">
                          <span className="text-xs text-blue-400 font-bold">{session.present_count} Students Present</span>
                          <span className={`text-[9px] font-bold uppercase tracking-wider ${session.is_open === 1 ? 'text-green-500' : 'text-red-500'}`}>
                            {session.is_open === 1 ? 'Open' : 'Closed'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedSession && user?.role === 'teacher' && (
                <div className="mb-8 animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                      <UserIcon size={18} className="text-blue-400" /> Attendance for: {selectedSession.title}
                    </h3>
                    <button 
                      onClick={() => setSelectedSession(null)}
                      className="text-xs text-gray-500 hover:text-white underline"
                    >
                      Close Details
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {sessionAttendance.map(record => (
                      <div key={record.id} className="bg-gray-800/80 p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                        <span className="text-sm font-semibold">{record.student_name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          record.status === 'present' ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'
                        }`}>
                          {record.status}
                        </span>
                      </div>
                    ))}
                    {sessionAttendance.length === 0 && <p className="col-span-full text-center text-gray-500 py-4">No attendance marked for this session.</p>}
                  </div>
                </div>
              )}

              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
                {user?.role === 'teacher' ? 'All Attendance Logs' : 'My Attendance History'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {attendance.filter(r => !!r.session_title).map((record: any) => (
                  <div key={record.id} className="bg-gray-700/50 p-4 rounded-xl flex justify-between items-center border border-gray-600/50 hover:border-blue-500/30 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-blue-400 font-bold border border-gray-500">
                        {(record.student_name || user?.name || '?').charAt(0)}
                      </div>
                      <div>
                        <span className="font-semibold block text-gray-100 group-hover:text-blue-300 transition-colors">{record.student_name || 'You'}</span>
                        <div className="flex flex-col">
                          <span className="text-xs text-blue-400 font-bold">{record.session_title}</span>
                          <span className="text-[10px] text-gray-500 flex items-center gap-1"><Calendar size={10}/> {record.date}</span>
                        </div>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                      record.status === 'present' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {record.status}
                    </span>
                  </div>
                ))}
                {attendance.filter(r => !!r.session_title).length === 0 && (
                  <div className="col-span-full py-12 text-center bg-gray-700/20 rounded-2xl border border-dashed border-gray-600">
                    <p className="text-gray-500">No attendance records found yet.</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'assignments' && (
            <section className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <BookOpen className="text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-bold">Assignments</h2>
                </div>
              </div>

              {user?.role === 'teacher' && (
                <div className="mb-8 bg-blue-600/5 p-6 rounded-2xl border border-blue-500/20">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Upload size={18} className="text-blue-400" /> Upload New Assignment
                  </h3>
                  <form onSubmit={postAssignment} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <input
                        type="text"
                        placeholder="Assignment Title"
                        className="w-full bg-gray-900/50 border border-gray-600 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={newAssignment.title}
                        onChange={(e) => setNewAssignment({ ...newAssignment, title: e.target.value })}
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <textarea
                        placeholder="Description & Instructions"
                        className="w-full bg-gray-900/50 border border-gray-600 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[100px]"
                        value={newAssignment.description}
                        onChange={(e) => setNewAssignment({ ...newAssignment, description: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1 ml-1 uppercase font-bold tracking-wider">Due Date</label>
                      <input
                        type="date"
                        className="w-full bg-gray-900/50 border border-gray-600 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={newAssignment.due_date}
                        onChange={(e) => setNewAssignment({ ...newAssignment, due_date: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1 ml-1 uppercase font-bold tracking-wider">Upload File (PDF/Word)</label>
                      <input
                        type="file"
                        className="w-full bg-gray-900/50 border border-gray-600 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                        onChange={(e) => setAssignmentFile(e.target.files ? e.target.files[0] : null)}
                        accept=".pdf,.doc,.docx"
                      />
                    </div>
                    <div className="flex items-end md:col-span-2">
                      <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20">
                        Create Assignment
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {assignments.map((assignment: any) => {
                  const isDeadlineNear = new Date(assignment.due_date) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                  const submission = studentSubmissions.find(s => Number(s.assignment_id) === Number(assignment.id));
                  const isSubmitted = !!submission;

                  return (
                    <div key={assignment.id} className="bg-gray-700/50 p-6 rounded-2xl border border-gray-600/50 flex flex-col hover:border-blue-500/30 transition-all relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-3 flex flex-col items-end gap-2">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter ${
                          isDeadlineNear ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-gray-600 text-gray-300'
                        }`}>
                          Deadline: {assignment.due_date}
                        </span>
                        {isSubmitted && (
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter bg-green-500/20 text-green-400 border border-green-500/30">
                            Submitted
                          </span>
                        )}
                        {user?.role === 'teacher' && (
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter ${
                            assignment.submission_count > 0 ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-600 text-gray-300'
                          }`}>
                            {assignment.submission_count} {assignment.submission_count === 1 ? 'Submission' : 'Submissions'}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-bold text-gray-100 mb-2 group-hover:text-blue-300 transition-colors pr-20">{assignment.title}</h3>
                      <p className="text-gray-400 text-sm mb-4 flex-grow leading-relaxed">{assignment.description}</p>
                      
                      {(assignment.file_name || assignment.file_path) && (
                        <div className="mb-6">
                          <a 
                            href={getAssignmentFileUrl(assignment.id)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-blue-900/30 hover:bg-blue-600/40 text-blue-400 px-4 py-2 rounded-lg border border-blue-500/20 transition-all text-sm font-semibold"
                          >
                            <FileText size={16} /> View Assignment File
                          </a>
                        </div>
                      )}
                      
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-4 border-t border-gray-600/50 mt-auto">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                            <UserIcon size={14} />
                          </div>
                          <span className="text-xs text-gray-400">Teacher: <span className="text-gray-300">{assignment.teacher_name}</span></span>
                        </div>
                        
                        {user?.role === 'student' ? (
                           <div className="w-full md:w-auto flex flex-col gap-3">
                             {isSubmitted ? (
                               <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl flex flex-col gap-3">
                                 <div className="flex items-center gap-2 text-green-400 font-bold text-sm">
                                   <CheckCircle size={16} /> Assignment Submitted
                                 </div>
                                 <div className="bg-gray-900/50 p-3 rounded-lg text-xs text-gray-400 border border-gray-700/50 italic">
                                   "{submission.content || 'No text content provided'}"
                                 </div>
                                 {(submission.file_name || submission.file_path) && (
                                   <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                     <FileText size={12} /> {submission.file_name || submission.file_path.split('-').slice(1).join('-')}
                                   </div>
                                 )}
                                 {(submission.grade || submission.feedback) && (
                                   <div className="mt-2 pt-2 border-t border-green-500/20">
                                     {submission.grade && (
                                       <div className="flex items-center gap-2 text-sm font-bold text-blue-400">
                                         <Award size={14} /> Grade: {submission.grade}
                                       </div>
                                     )}
                                     {submission.feedback && (
                                       <div className="flex items-start gap-2 text-xs text-gray-300 mt-1">
                                         <MessageSquare size={14} className="mt-0.5 text-gray-500" />
                                         <span>Feedback: {submission.feedback}</span>
                                       </div>
                                     )}
                                   </div>
                                 )}
                               </div>
                             ) : (
                               <>
                                 <textarea
                                   placeholder="Type your submission here..."
                                   className="w-full md:w-72 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                   value={submissionContent[assignment.id] || ''}
                                   onChange={(e) => setSubmissionContent({ ...submissionContent, [assignment.id]: e.target.value })}
                                 />
                                 <div className="flex flex-col gap-1">
                                   <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Attach File (Optional)</label>
                                   <input
                                     type="file"
                                     className="w-full md:w-72 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-bold file:bg-gray-700 file:text-gray-300"
                                     onChange={(e) => setSubmissionFile({ ...submissionFile, [assignment.id]: e.target.files ? e.target.files[0] : null })}
                                     accept=".pdf,.doc,.docx"
                                   />
                                 </div>
                                 <button 
                                   onClick={() => submitAssignment(assignment.id)}
                                   className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                                 >
                                   <Upload size={14} /> Submit Submission
                                 </button>
                               </>
                             )}
                           </div>
                        ) : (
                          <div className="w-full md:w-auto flex gap-2">
                            <button 
                              onClick={() => fetchSubmissions(assignment.id)}
                              className="flex-1 md:flex-none bg-gray-600 hover:bg-blue-600 text-white text-sm font-bold py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                            >
                              <FileText size={14} /> Submissions
                            </button>
                            <button 
                              onClick={() => deleteAssignment(assignment.id)}
                              className="p-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-lg transition-all border border-red-600/30"
                              title="Delete Assignment"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {assignments.length === 0 && (
                  <div className="col-span-full py-12 text-center bg-gray-700/20 rounded-2xl border border-dashed border-gray-600">
                    <p className="text-gray-500">No assignments have been posted yet.</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'submissions' && user?.role === 'teacher' && (
            <section className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <FileText className="text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Student Submissions</h2>
                    {currentAssignmentId && (
                      <p className="text-xs text-gray-500 mt-1">Showing submissions for: <span className="text-blue-400 font-semibold">{assignments.find(a => a.id === currentAssignmentId)?.title}</span></p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {plagiarismReport.length > 0 && (
                    <button 
                      onClick={() => setActiveTab('plagiarism')}
                      className="flex items-center gap-2 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white px-4 py-2 rounded-lg transition-all border border-blue-600/30 text-sm font-bold"
                    >
                      <BarChartIcon size={16} /> View Full Plag Report
                    </button>
                  )}
                  <button 
                    onClick={() => currentAssignmentId && checkPlagiarism(currentAssignmentId)}
                    disabled={checkingPlagiarism}
                    className="flex items-center gap-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-4 py-2 rounded-lg transition-all border border-red-600/30 text-sm font-bold"
                  >
                    <ShieldAlert size={16} /> {checkingPlagiarism ? 'Scanning...' : 'Scan Plagiarism'}
                  </button>
                  <button 
                    onClick={() => setActiveTab('assignments')}
                    className="text-gray-400 hover:text-white text-sm font-semibold"
                  >
                    Back to Assignments
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {submissions.map((sub: any) => {
                  const similarity = getSimilarityForStudent(sub.student_name);
                  return (
                    <div key={sub.id} className="bg-gray-700/50 p-5 rounded-2xl border border-gray-600/50">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20">
                            {sub.student_name.charAt(0)}
                          </div>
                          <div>
                          <span className="font-bold text-gray-100">{sub.student_name}</span>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                            <span className="text-xs text-gray-500">Submitted at: {formatDate(sub.submitted_at)}</span>
                            {(sub.enrollment_number || sub.branch || sub.semester) && (
                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-blue-400/80 bg-blue-900/20 px-2 py-0.5 rounded border border-blue-500/20">
                                {sub.enrollment_number && <span>ID: {sub.enrollment_number}</span>}
                                {sub.branch && <span>• {sub.branch}</span>}
                                {sub.semester && <span>• Sem: {sub.semester}</span>}
                               </div>
                             )}
                           </div>
                         </div>
                        </div>
                         {similarity !== null ? (
                          <div className={`flex flex-col items-end gap-1 ${similarity > 70 ? 'text-red-400' : similarity > 30 ? 'text-yellow-500' : 'text-green-400'}`}>
                            <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest">
                              <ShieldAlert size={14} />
                              {similarity}% Similarity
                            </div>
                            <span className="text-[10px] opacity-60">Compared to peers/instructions</span>
                          </div>
                        ) : submissions.length >= 1 ? (
                          <div className="flex flex-col items-end gap-1 text-gray-500 opacity-60 italic">
                            <span className="text-[10px] uppercase font-bold tracking-widest">Pending Scan</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1 text-gray-500 opacity-40 italic">
                            <span className="text-[10px] uppercase font-bold tracking-widest">No submissions yet</span>
                          </div>
                        )}
                      </div>
                      <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-600 text-sm text-gray-300 leading-relaxed mb-4">
                        {sub.content || <span className="text-gray-500 italic">No text content provided</span>}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          {(sub.file_name || sub.file_path) && (
                            <a 
                              href={getSubmissionFileUrl(sub.id)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-xs font-bold bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-500/20 transition-all w-full"
                            >
                              <Download size={12} /> Download Student's File
                            </a>
                          )}
                          <div className="flex items-center gap-2 text-gray-400 text-xs">
                            <Calendar size={12} /> Submitted: {formatDate(sub.submitted_at)}
                          </div>
                        </div>

                        <div className="bg-gray-800/80 p-4 rounded-xl border border-gray-600 space-y-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Award size={16} className="text-blue-400" />
                            <span className="text-sm font-bold text-gray-200">Grading & Feedback</span>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Grade (e.g. A, 90/100)"
                              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                              value={grading[sub.id]?.grade || ''}
                              onChange={(e) => setGrading({ ...grading, [sub.id]: { ...grading[sub.id], grade: e.target.value } })}
                            />
                          </div>
                          <textarea
                            placeholder="Teacher's feedback..."
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none min-h-[60px]"
                            value={grading[sub.id]?.feedback || ''}
                            onChange={(e) => setGrading({ ...grading, [sub.id]: { ...grading[sub.id], feedback: e.target.value } })}
                          />
                          <button
                            onClick={() => submitGrade(sub.id)}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold py-1.5 rounded-lg transition-all"
                          >
                            Update Grade & Feedback
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {submissions.length === 0 && (
                  <div className="py-12 text-center bg-gray-700/20 rounded-2xl border border-dashed border-gray-600">
                    <p className="text-gray-500">No submissions found for this assignment.</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'plagiarism' && user?.role === 'teacher' && (
            <section className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/10 rounded-lg">
                    <ShieldAlert className="text-red-400" />
                  </div>
                  <h2 className="text-2xl font-bold">Plagiarism Report</h2>
                </div>
                <button 
                  onClick={() => setActiveTab('submissions')}
                  className="text-gray-400 hover:text-white text-sm font-semibold"
                >
                  Back to Submissions
                </button>
              </div>

              <div className="space-y-6">
                {plagiarismReport.map((report: any, index: number) => {
                  const isCritical = Number(report.score) > 70;
                  return (
                    <div key={index} className={`p-6 rounded-2xl border transition-all ${
                      isCritical ? 'bg-red-900/10 border-red-500/30' : 'bg-gray-700/30 border-gray-600/50'
                    }`}>
                      <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center -space-x-2">
                            <div className="w-10 h-10 rounded-full bg-gray-600 border-2 border-gray-800 flex items-center justify-center font-bold text-gray-200">
                              {report.student1.charAt(0)}
                            </div>
                            <div className="w-10 h-10 rounded-full bg-blue-600 border-2 border-gray-800 flex items-center justify-center font-bold text-white">
                              {report.student2.charAt(0)}
                            </div>
                          </div>
                          <div>
                            <span className="font-bold text-gray-100">{report.student1}</span>
                            <span className="text-gray-500 mx-2">&</span>
                            <span className="font-bold text-gray-100">{report.student2}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-black ${isCritical ? 'text-red-500' : 'text-yellow-500'}`}>
                            {report.score}% Match
                          </div>
                          {isCritical && (
                            <span className="text-[10px] font-bold uppercase tracking-widest text-red-400 flex items-center justify-end gap-1">
                              <AlertTriangle size={10} /> Critical Similarity
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <span className="text-[10px] text-gray-500 uppercase font-black ml-1">{report.student1}'s content</span>
                          <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 text-xs text-gray-400 line-clamp-3">
                            "{report.content1}"
                          </div>
                        </div>
                        <div className="space-y-2">
                          <span className="text-[10px] text-gray-500 uppercase font-black ml-1">{report.student2}'s content</span>
                          <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 text-xs text-gray-400 line-clamp-3">
                            "{report.content2}"
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {plagiarismReport.length === 0 && (
                  <div className="py-20 text-center bg-gray-900/20 rounded-3xl border border-dashed border-gray-700">
                    <CheckCircle size={40} className="mx-auto text-green-500/20 mb-4" />
                    <p className="text-gray-500 font-medium">No significant similarities found between submissions.</p>
                    <p className="text-xs text-gray-600 mt-1">Similarity threshold is currently set to 30%.</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'doubts' && (
            <section className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                  <MessageCircle className="text-indigo-400" />
                </div>
                <h2 className="text-2xl font-bold">Doubt Section</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Post Doubt Form - Only for Students */}
                <div className={user?.role === 'student' ? 'lg:col-span-1' : 'hidden'}>
                  <div className="bg-gray-900/30 p-6 rounded-2xl border border-gray-700 sticky top-8">
                    <h3 className="text-lg font-semibold mb-4 text-gray-200">Ask a Doubt</h3>
                    <p className="text-sm text-gray-400 mb-6">Write your questions or points here. The teacher and other students can see them.</p>
                    <form onSubmit={(e) => postDoubt(e)} className="space-y-4">
                      <textarea
                        value={newDoubt}
                        onChange={(e) => setNewDoubt(e.target.value)}
                        placeholder="Type your question..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-h-[120px] transition-all"
                        required
                      />
                      <button
                        type="submit"
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20"
                      >
                        <Send size={18} /> Post Doubt
                      </button>
                    </form>
                  </div>
                </div>

                {/* Doubts List */}
                <div className={user?.role === 'student' ? 'lg:col-span-2 space-y-6' : 'lg:col-span-3 space-y-6'}>
                  {doubts.filter(d => !d.parent_id).map((doubt: any) => (
                    <div key={doubt.id} className="bg-gray-700/30 p-6 rounded-2xl border border-gray-700 hover:border-indigo-500/30 transition-all group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border ${
                            doubt.role === 'teacher' 
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                              : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          }`}>
                            {doubt.user_name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-100">{doubt.user_name}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize border ${
                                doubt.role === 'teacher' 
                                  ? 'bg-blue-900/30 text-blue-300 border-blue-700/50' 
                                  : 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50'
                              }`}>
                                {doubt.role}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                              <span className="text-[10px] text-gray-500">
                                {formatDate(doubt.created_at)}
                              </span>
                              {user?.role === 'teacher' && doubt.role === 'student' && (doubt.enrollment_number || doubt.branch || doubt.semester) && (
                                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-indigo-400/80 bg-indigo-900/20 px-1.5 py-0.5 rounded border border-indigo-500/20">
                                  {doubt.enrollment_number && <span>ID: {doubt.enrollment_number}</span>}
                                  {doubt.branch && <span>• {doubt.branch}</span>}
                                  {doubt.semester && <span>• Sem: {doubt.semester}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {user?.id === doubt.user_id && (
                          <button
                            onClick={() => deleteDoubt(doubt.id)}
                            className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                            title="Delete Doubt"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50 text-gray-300 leading-relaxed">
                        {doubt.content}
                      </div>

                      {/* Replies Section */}
                      <div className="mt-6 space-y-4 ml-8 border-l-2 border-indigo-500/20 pl-6">
                        {doubts.filter(d => d.parent_id === doubt.id).map((reply: any) => (
                          <div key={reply.id} className="bg-gray-800/30 p-4 rounded-xl border border-gray-700/50">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                                  reply.role === 'teacher' 
                                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                                    : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                }`}>
                                  {reply.user_name.charAt(0)}
                                </div>
                                <span className="text-xs font-bold text-gray-200">{reply.user_name}</span>
                                <span className={`text-[8px] px-1.5 py-0 rounded-full capitalize border ${
                                  reply.role === 'teacher' 
                                    ? 'bg-blue-900/30 text-blue-300 border-blue-700/50' 
                                    : 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50'
                                }`}>
                                  {reply.role}
                                </span>
                              </div>
                              {user?.id === reply.user_id && (
                                <button
                                  onClick={() => deleteDoubt(reply.id)}
                                  className="text-gray-500 hover:text-red-400"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                            <div className="text-xs text-gray-300">
                              {reply.content}
                            </div>
                          </div>
                        ))}

                        {/* Teacher Reply Input */}
                        {user?.role === 'teacher' && (
                          <div className="mt-4 flex gap-2">
                            <input
                              type="text"
                              value={replyContent[doubt.id] || ''}
                              onChange={(e) => setReplyContent({ ...replyContent, [doubt.id]: e.target.value })}
                              placeholder="Type a reply..."
                              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                            />
                            <button
                              onClick={(e) => postDoubt(e, doubt.id)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                            >
                              <Send size={12} /> Reply
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {doubts.filter(d => !d.parent_id).length === 0 && (
                    <div className="py-20 text-center bg-gray-900/20 rounded-3xl border border-dashed border-gray-700">
                      <MessageCircle size={40} className="mx-auto text-gray-600 mb-4 opacity-20" />
                      <p className="text-gray-500">No doubts posted yet. Be the first to ask!</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
          {activeTab === 'profile' && user?.role === 'student' && (
            <section className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <UserIcon className="text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold">My Profile</h2>
              </div>

              <div className="max-w-2xl bg-gray-900/30 p-8 rounded-2xl border border-gray-700">
                <form onSubmit={updateProfile} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">Full Name</label>
                      <input 
                        type="text" 
                        value={user?.name} 
                        disabled 
                        className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed outline-none"
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">Email Address</label>
                      <input 
                        type="email" 
                        value={user?.email} 
                        disabled 
                        className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">Enrollment Number</label>
                      <input 
                        type="text" 
                        placeholder="e.g. EN12345678"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={profile.enrollment_number}
                        onChange={(e) => setProfile({...profile, enrollment_number: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">Branch</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Computer Science"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={profile.branch}
                        onChange={(e) => setProfile({...profile, branch: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">Semester</label>
                      <select 
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={profile.semester}
                        onChange={(e) => setProfile({...profile, semester: e.target.value})}
                      >
                        <option value="">Select Semester</option>
                        {[1,2,3,4,5,6,7,8].map(sem => (
                          <option key={sem} value={sem}>{sem}{sem === 1 ? 'st' : sem === 2 ? 'nd' : sem === 3 ? 'rd' : 'th'} Semester</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-12 rounded-xl transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50"
                    >
                      {savingProfile ? 'Saving...' : 'Save Profile Details'}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
