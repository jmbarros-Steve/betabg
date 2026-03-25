import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Trophy, RotateCcw } from 'lucide-react';

interface Question {
  id: string;
  question: string;
  options: string[];
  correct_option: number;
  explanation: string | null;
  sort_order: number;
}

interface QuizViewProps {
  quiz: {
    id: string;
    title: string;
    passing_score: number;
  };
  questions: Question[];
  onSubmit: (quizId: string, answers: number[], score: number, passed: boolean) => void;
  previousBestScore?: number;
}

export function QuizView({ quiz, questions, onSubmit, previousBestScore }: QuizViewProps) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [passed, setPassed] = useState(false);

  const sortedQuestions = [...questions].sort((a, b) => a.sort_order - b.sort_order);
  const allAnswered = sortedQuestions.every(q => answers[q.id] !== undefined);

  const handleSelect = (questionId: string, optionIndex: number) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleSubmit = () => {
    let correct = 0;
    sortedQuestions.forEach(q => {
      if (answers[q.id] === q.correct_option) correct++;
    });

    const calculatedScore = Math.round((correct / sortedQuestions.length) * 100);
    const hasPassed = calculatedScore >= quiz.passing_score;

    setScore(calculatedScore);
    setPassed(hasPassed);
    setSubmitted(true);

    const answersArray = sortedQuestions.map(q => answers[q.id] ?? -1);
    onSubmit(quiz.id, answersArray, calculatedScore, hasPassed);
  };

  const handleRetry = () => {
    setAnswers({});
    setSubmitted(false);
    setScore(0);
    setPassed(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{quiz.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {sortedQuestions.length} preguntas — Puntaje minimo: {quiz.passing_score}%
          </p>
        </div>
        {previousBestScore !== undefined && (
          <Badge variant="outline" className="text-sm">
            Mejor puntaje: {previousBestScore}%
          </Badge>
        )}
      </div>

      {/* Result banner */}
      {submitted && (
        <Card className={passed ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}>
          <CardContent className="p-4 flex items-center gap-4">
            {passed ? (
              <>
                <Trophy className="w-10 h-10 text-green-600" />
                <div>
                  <p className="font-bold text-green-800">Aprobado con {score}%</p>
                  <p className="text-sm text-green-700">Has completado el examen exitosamente.</p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="w-10 h-10 text-red-600" />
                <div>
                  <p className="font-bold text-red-800">No aprobado — {score}%</p>
                  <p className="text-sm text-red-700">Necesitas al menos {quiz.passing_score}% para aprobar. Puedes reintentar.</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleRetry} className="ml-auto">
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Reintentar
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Questions */}
      {sortedQuestions.map((q, qIdx) => {
        const isCorrect = submitted && answers[q.id] === q.correct_option;
        const isWrong = submitted && answers[q.id] !== undefined && answers[q.id] !== q.correct_option;

        return (
          <Card key={q.id} className={submitted ? (isCorrect ? 'border-green-200' : isWrong ? 'border-red-200' : '') : ''}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-start gap-2">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                  {qIdx + 1}
                </span>
                {q.question}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(q.options as string[]).map((option, optIdx) => {
                const isSelected = answers[q.id] === optIdx;
                const showCorrect = submitted && optIdx === q.correct_option;
                const showWrong = submitted && isSelected && optIdx !== q.correct_option;

                return (
                  <button
                    key={optIdx}
                    onClick={() => handleSelect(q.id, optIdx)}
                    disabled={submitted}
                    className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${
                      showCorrect
                        ? 'border-green-400 bg-green-50 text-green-800'
                        : showWrong
                        ? 'border-red-400 bg-red-50 text-red-800'
                        : isSelected
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {showCorrect && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                      {showWrong && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                      {!submitted && (
                        <span className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                          isSelected ? 'border-primary bg-primary' : 'border-slate-300'
                        }`}>
                          {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                        </span>
                      )}
                      <span>{option}</span>
                    </div>
                  </button>
                );
              })}

              {/* Explanation after submit */}
              {submitted && q.explanation && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">{q.explanation}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Submit button */}
      {!submitted && (
        <div className="flex justify-center pt-4">
          <Button size="lg" onClick={handleSubmit} disabled={!allAnswered}>
            Enviar respuestas ({Object.keys(answers).length}/{sortedQuestions.length})
          </Button>
        </div>
      )}
    </div>
  );
}
