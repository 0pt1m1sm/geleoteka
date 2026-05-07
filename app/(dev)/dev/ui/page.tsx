"use client";

import { useState } from "react";
import { ShoppingCart, Search, Mail, Settings, Trash, Edit, Plus, ChevronRight } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
  Select,
  Textarea,
  Checkbox,
  RadioGroup,
  Badge,
  Alert,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Skeleton,
  Tooltip,
  PageHeader,
} from "@/components/ui";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

type RadioVal = "monthly" | "yearly" | "lifetime";

export default function DevUIPage(): React.ReactElement {
  const [tab, setTab] = useState("buttons");
  const [radio, setRadio] = useState<RadioVal>("yearly");
  const [check, setCheck] = useState(true);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-[var(--card)]/80">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent)]">Dev</span>
            <h1 className="text-display text-xl font-bold">UI Primitives Gallery</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 flex flex-col gap-16">
        <PageHeader
          eyebrow="Showcase"
          title="14 atomic primitives"
          description="Каждый компонент в обоих темах + основные варианты. Используется как baseline для visual regression."
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList ariaLabel="Categories">
            <TabsTrigger value="buttons">Buttons & Actions</TabsTrigger>
            <TabsTrigger value="forms">Forms</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
            <TabsTrigger value="overlays">Overlays</TabsTrigger>
          </TabsList>

          {/* BUTTONS */}
          <TabsContent value="buttons">
            <Section title="Button — variants × sizes">
              <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 items-center">
                <span className="text-sm text-[var(--foreground-muted)]">Primary</span>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button size="sm">Малая</Button>
                  <Button>Средняя</Button>
                  <Button size="lg">Большая</Button>
                  <Button leftIcon={<ShoppingCart size={16} />}>В корзину</Button>
                  <Button rightIcon={<ChevronRight size={16} />}>Дальше</Button>
                  <Button isLoading>Загрузка</Button>
                  <Button disabled>Отключено</Button>
                </div>
                <span className="text-sm text-[var(--foreground-muted)]">Secondary</span>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button variant="secondary" size="sm">Малая</Button>
                  <Button variant="secondary">Средняя</Button>
                  <Button variant="secondary" size="lg">Большая</Button>
                </div>
                <span className="text-sm text-[var(--foreground-muted)]">Ghost</span>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button variant="ghost" size="sm">Малая</Button>
                  <Button variant="ghost">Средняя</Button>
                  <Button variant="ghost" leftIcon={<Settings size={16} />}>Настройки</Button>
                </div>
                <span className="text-sm text-[var(--foreground-muted)]">Outline</span>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button variant="outline" size="sm">Малая</Button>
                  <Button variant="outline">Средняя</Button>
                  <Button variant="outline" leftIcon={<Edit size={16} />}>Редактировать</Button>
                </div>
              </div>
            </Section>
          </TabsContent>

          {/* FORMS */}
          <TabsContent value="forms">
            <Section title="Input">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                <Input label="Имя" placeholder="Иван Петров" />
                <Input label="Email" type="email" placeholder="ivan@example.ru" leftIcon={<Mail size={16} />} />
                <Input label="Поиск" placeholder="VIN или артикул" leftIcon={<Search size={16} />} />
                <Input label="Пароль" type="password" error="Минимум 8 символов" />
                <Input label="Телефон" placeholder="+7 (___) ___-__-__" helperText="С кодом страны" />
                <Input label="Отключено" disabled defaultValue="Только чтение" />
              </div>
            </Section>

            <Section title="Select">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                <Select label="Модель" defaultValue="g">
                  <option value="g">G-Class</option>
                  <option value="gle">GLE</option>
                  <option value="s">S-Class</option>
                </Select>
                <Select label="Год" error="Обязательное поле">
                  <option value="">Выберите...</option>
                  <option value="2020">2020</option>
                  <option value="2021">2021</option>
                </Select>
              </div>
            </Section>

            <Section title="Textarea">
              <div className="max-w-2xl">
                <Textarea label="Комментарий" rows={4} placeholder="Опишите проблему..." helperText="Опишите подробно" />
              </div>
            </Section>

            <Section title="Checkbox">
              <div className="flex flex-col gap-3">
                <Checkbox label="Согласен с условиями" checked={check} onChange={(e) => setCheck(e.target.checked)} />
                <Checkbox label="Получать уведомления" description="SMS при смене статуса" />
                <Checkbox label="Отключено" disabled />
              </div>
            </Section>

            <Section title="RadioGroup">
              <div className="max-w-md">
                <RadioGroup<RadioVal>
                  name="plan"
                  legend="Тарифный план"
                  value={radio}
                  onValueChange={setRadio}
                  options={[
                    { value: "monthly", label: "Ежемесячно", description: "990 ₽/мес" },
                    { value: "yearly", label: "Ежегодно", description: "9 900 ₽/год — экономия 17%" },
                    { value: "lifetime", label: "Навсегда", description: "29 900 ₽ один раз" },
                  ]}
                />
              </div>
            </Section>
          </TabsContent>

          {/* DISPLAY */}
          <TabsContent value="display">
            <Section title="Card composition">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
                <Card>
                  <CardHeader>
                    <CardTitle>Простая карточка</CardTitle>
                    <CardDescription>Описание ниже заголовка</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">Содержимое карточки. Использует CSS-токены для всех значений цвета и border.</p>
                  </CardContent>
                </Card>
                <Card hover>
                  <CardHeader>
                    <CardTitle>С hover-эффектом</CardTitle>
                    <CardDescription>Наведите указатель</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">При hover тень и фон меняются.</p>
                  </CardContent>
                  <CardFooter>
                    <Button size="sm" variant="outline">Подробнее</Button>
                  </CardFooter>
                </Card>
              </div>
            </Section>

            <Section title="Badge — variants">
              <div className="flex flex-wrap gap-2">
                <Badge variant="neutral">Нейтральный</Badge>
                <Badge variant="success">Успешно</Badge>
                <Badge variant="warning">Внимание</Badge>
                <Badge variant="error">Ошибка</Badge>
                <Badge variant="info">Информация</Badge>
                <Badge variant="silver">Silver</Badge>
                <Badge variant="gold">Gold</Badge>
                <Badge variant="amg">AMG</Badge>
              </div>
            </Section>

            <Section title="Alert — variants">
              <div className="flex flex-col gap-3 max-w-2xl">
                <Alert variant="success" title="Успешно сохранено">Данные обновлены.</Alert>
                <Alert variant="error" title="Ошибка">Не удалось загрузить заказы. Повторите попытку.</Alert>
                <Alert variant="info">Заказ-наряд готов. Вас уведомят SMS.</Alert>
                <Alert variant="warning" title="Требуется подтверждение">Нажмите &laquo;Принять&raquo; для подтверждения сметы.</Alert>
              </div>
            </Section>

            <Section title="Skeleton — loading state">
              <div className="flex flex-col gap-3 max-w-md">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-3 mt-2">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 flex flex-col gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </div>
            </Section>
          </TabsContent>

          {/* OVERLAYS */}
          <TabsContent value="overlays">
            <Section title="Dialog — Radix-powered, focus trap, ESC closes">
              <Dialog>
                <DialogTrigger asChild>
                  <Button leftIcon={<Plus size={16} />}>Открыть диалог</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Подтверждение</DialogTitle>
                    <DialogDescription>Удалить запись? Это действие нельзя отменить.</DialogDescription>
                  </DialogHeader>
                  <p className="text-sm">Tab циклит фокус внутри диалога; ESC закрывает; backdrop click тоже закрывает.</p>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="ghost">Отмена</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button leftIcon={<Trash size={16} />}>Удалить</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Section>

            <Section title="Tooltip — :hover AND :focus-visible (WCAG 1.4.13)">
              <div className="flex flex-wrap gap-4 items-center">
                <Tooltip label="Сверху">
                  <button className="btn btn-secondary" type="button">Hover or Tab</button>
                </Tooltip>
                <Tooltip label="Снизу" position="bottom">
                  <button className="btn btn-secondary" type="button">Снизу</button>
                </Tooltip>
                <Tooltip label="Слева" position="left">
                  <button className="btn btn-secondary" type="button">Слева</button>
                </Tooltip>
                <Tooltip label="Справа" position="right">
                  <button className="btn btn-secondary" type="button">Справа</button>
                </Tooltip>
              </div>
            </Section>
          </TabsContent>
        </Tabs>

        <footer className="border-t border-[var(--border)] pt-6 text-xs text-[var(--foreground-muted)]">
          /dev/ui — NODE_ENV-gated showcase. Returns 404 в production builds.
        </footer>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-display text-2xl font-bold border-b border-[var(--border)] pb-2">{title}</h2>
      {children}
    </section>
  );
}
