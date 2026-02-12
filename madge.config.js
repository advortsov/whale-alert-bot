// madge.config.js
export default {
  // Директории для анализа
  baseDir: process.cwd(),

  // Расширения файлов
  extensions: ['ts'],

  // Исключаемые паттерны
  exclude: [
    'node_modules',
    'dist',
    'coverage',
    'database',
    '**/*.spec.ts',
    '**/*.test.ts',
    '**/*.d.ts'
  ],

  // Детект циклических зависимостей
  detectiveOptions: {
    ts: {
      skipTypeImports: true, // Игнорировать type-импорты
    },
  },

  // Формат вывода
  output: {
    graph: 'dependency-graph.png', // Визуализация
    json: 'dependency-graph.json', // Данные для CI
  },
};
