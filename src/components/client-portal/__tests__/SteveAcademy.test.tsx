import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock useAuth
const mockUser = { id: 'user-1', email: 'test@test.com' };
let mockUserValue: any = mockUser;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUserValue, session: null, loading: false }),
}));

// Mock CourseView
vi.mock('../academy/CourseView', () => ({
  CourseView: ({ courseId, onBack }: { courseId: string; onBack: () => void }) => (
    <div data-testid="course-view">
      <span>CourseView:{courseId}</span>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

// Mock CourseCard
vi.mock('../academy/CourseCard', () => ({
  CourseCard: ({ course, onClick }: { course: any; onClick: () => void }) => (
    <div data-testid="course-card" onClick={onClick}>
      <span>{course.title}</span>
      <span>{course.category}</span>
    </div>
  ),
}));

const mockCourses = [
  {
    id: 'course-1',
    title: 'Marketing Digital 101',
    description: 'Fundamentos del marketing',
    slug: 'marketing-101',
    thumbnail_url: null,
    category: 'marketing',
    difficulty: 'beginner',
    estimated_hours: 4,
    sort_order: 1,
    is_published: true,
  },
  {
    id: 'course-2',
    title: 'Meta Ads Avanzado',
    description: 'Domina campañas de Meta',
    slug: 'meta-ads',
    thumbnail_url: null,
    category: 'ads',
    difficulty: 'advanced',
    estimated_hours: 8,
    sort_order: 2,
    is_published: true,
  },
  {
    id: 'course-3',
    title: 'Google Ads Básico',
    description: 'Intro a Google Ads',
    slug: 'google-ads-basico',
    thumbnail_url: null,
    category: 'ads',
    difficulty: 'beginner',
    estimated_hours: 3,
    sort_order: 3,
    is_published: true,
  },
];

const mockLessons = [
  { id: 'lesson-1', course_id: 'course-1' },
  { id: 'lesson-2', course_id: 'course-1' },
  { id: 'lesson-3', course_id: 'course-2' },
];

// Mock supabase to control all queries
let supabaseMockData: Record<string, any[]> = {};

vi.mock('@/integrations/supabase/client', () => {
  const createChain = (tableName: string) => {
    const chain: any = {};
    const methods = ['select', 'eq', 'in', 'order', 'limit', 'single', 'maybeSingle'];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // Make chain awaitable
    Object.defineProperty(chain, 'then', {
      value: (resolve: any) => resolve({ data: supabaseMockData[tableName] || [], error: null }),
      writable: true,
      configurable: true,
    });
    return chain;
  };

  return {
    supabase: {
      from: vi.fn((table: string) => createChain(table)),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    },
  };
});

import { SteveAcademy } from '../SteveAcademy';

describe('SteveAcademy', () => {
  beforeEach(() => {
    mockUserValue = mockUser;
    supabaseMockData = {
      academy_courses: mockCourses,
      academy_lessons: mockLessons,
      academy_enrollments: [],
      academy_lesson_progress: [],
      academy_certificates: [],
    };
  });

  it('shows loading spinner initially', async () => {
    render(<SteveAcademy clientId="test-client" />);

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();

    await waitFor(() => {
      expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
    });
  });

  it('renders course cards after loading', async () => {
    render(<SteveAcademy clientId="test-client" />);

    await waitFor(() => {
      expect(screen.getByText('Marketing Digital 101')).toBeInTheDocument();
      expect(screen.getByText('Meta Ads Avanzado')).toBeInTheDocument();
      expect(screen.getByText('Google Ads Básico')).toBeInTheDocument();
    });
  });

  it('shows header with Steve Academy title', async () => {
    render(<SteveAcademy clientId="test-client" />);

    await waitFor(() => {
      expect(screen.getByText('Steve Academy')).toBeInTheDocument();
      expect(screen.getByText('Aprende marketing digital y certifícate')).toBeInTheDocument();
    });
  });

  it('shows empty state when no courses', async () => {
    supabaseMockData = {
      academy_courses: [],
      academy_lessons: [],
      academy_enrollments: [],
      academy_lesson_progress: [],
      academy_certificates: [],
    };

    render(<SteveAcademy clientId="test-client" />);

    await waitFor(() => {
      expect(screen.getByText('No se encontraron cursos')).toBeInTheDocument();
    });
  });

  it('search filters courses by title', async () => {
    const user = userEvent.setup();

    render(<SteveAcademy clientId="test-client" />);

    await waitFor(() => {
      expect(screen.getByText('Marketing Digital 101')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Buscar cursos...');
    await user.type(searchInput, 'Meta');

    expect(screen.getByText('Meta Ads Avanzado')).toBeInTheDocument();
    expect(screen.queryByText('Marketing Digital 101')).not.toBeInTheDocument();
    expect(screen.queryByText('Google Ads Básico')).not.toBeInTheDocument();
  });

  it('search filters courses by category', async () => {
    const user = userEvent.setup();

    render(<SteveAcademy clientId="test-client" />);

    await waitFor(() => {
      expect(screen.getByText('Marketing Digital 101')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Buscar cursos...');
    await user.type(searchInput, 'ads');

    expect(screen.getByText('Meta Ads Avanzado')).toBeInTheDocument();
    expect(screen.getByText('Google Ads Básico')).toBeInTheDocument();
    expect(screen.queryByText('Marketing Digital 101')).not.toBeInTheDocument();
  });

  it('search shows empty state when no matches', async () => {
    const user = userEvent.setup();

    render(<SteveAcademy clientId="test-client" />);

    await waitFor(() => {
      expect(screen.getByText('Marketing Digital 101')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Buscar cursos...');
    await user.type(searchInput, 'zzzznonexistent');

    expect(screen.getByText('No se encontraron cursos')).toBeInTheDocument();
  });

  it('clicking a course shows CourseView', async () => {
    const user = userEvent.setup();

    render(<SteveAcademy clientId="test-client" />);

    await waitFor(() => {
      expect(screen.getByText('Marketing Digital 101')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Marketing Digital 101'));

    expect(screen.getByTestId('course-view')).toBeInTheDocument();
    expect(screen.getByText('CourseView:course-1')).toBeInTheDocument();
  });

  it('back from CourseView returns to course list', async () => {
    const user = userEvent.setup();

    render(<SteveAcademy clientId="test-client" />);

    await waitFor(() => {
      expect(screen.getByText('Marketing Digital 101')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Marketing Digital 101'));
    expect(screen.getByTestId('course-view')).toBeInTheDocument();

    await user.click(screen.getByText('Back'));

    await waitFor(() => {
      expect(screen.getByText('Marketing Digital 101')).toBeInTheDocument();
      expect(screen.queryByTestId('course-view')).not.toBeInTheDocument();
    });
  });

  it('does not crash when Supabase returns error', async () => {
    // Override to return error
    vi.mocked((await import('@/integrations/supabase/client')).supabase.from).mockImplementation((table: string) => {
      const chain: any = {};
      const methods = ['select', 'eq', 'in', 'order', 'limit', 'single', 'maybeSingle'];
      for (const m of methods) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      Object.defineProperty(chain, 'then', {
        value: (resolve: any) => resolve({ data: null, error: { message: 'Internal error' } }),
        writable: true,
        configurable: true,
      });
      return chain;
    });

    // Should not throw
    render(<SteveAcademy clientId="test-client" />);

    await waitFor(() => {
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).not.toBeInTheDocument();
    });
  });

  it('does not fetch when user is null (stays loading)', async () => {
    mockUserValue = null;

    render(<SteveAcademy clientId="test-client" />);

    // Should show loading and not crash
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();

    await new Promise(r => setTimeout(r, 0));
  });
});
