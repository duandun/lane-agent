import { HeadContent, Link, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Box, Button, Container, Flex, Text, Theme } from '@radix-ui/themes'
import { DesktopIcon, MoonIcon, SunIcon } from '@radix-ui/react-icons'

import radixCss from '@radix-ui/themes/styles.css?url'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'lane-mobile' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/lane-logo.svg' },
      { rel: 'stylesheet', href: radixCss },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

const THEME_KEY = 'lane-mobile-theme'
type ThemeMode = 'auto' | 'light' | 'dark'
const NEXT_MODE: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' }
const MODE_LABEL: Record<ThemeMode, string> = { auto: '跟随系统', light: '浅色', dark: '深色' }
const MODE_ICON: Record<ThemeMode, typeof SunIcon> = { auto: DesktopIcon, light: SunIcon, dark: MoonIcon }

function RootLayout() {
  const [mode, setMode] = useState<ThemeMode>('auto')
  const [systemDark, setSystemDark] = useState(false)

  // 首屏默认跟随系统；之后读取本地偏好并监听系统主题变化。
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'auto') setMode(saved)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  function cycleTheme() {
    const next = NEXT_MODE[mode]
    setMode(next)
    localStorage.setItem(THEME_KEY, next)
  }

  const appearance = mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode
  const ThemeIcon = MODE_ICON[mode]
  // SPA 外壳是预渲染的 "/"，高亮要等水合后再上，否则原地刷新会停在高亮错误项上
  // （Link 的 activeProps 默认就是 { className: 'active' }，这里用水合前的 {} 压掉）
  const activeProps = useHydrated() ? { className: 'active' } : {}

  // html/body 和 Radix Theme 外层一起切色，避免滚动或 overscroll 时露出白底。
  useEffect(() => {
    const bg = appearance === 'dark' ? '#0f1115' : '#f5f6f8'
    document.documentElement.style.background = bg
    document.documentElement.style.colorScheme = appearance
    document.body.style.background = bg
  }, [appearance])

  return (
    <Theme
      appearance={appearance}
      accentColor="indigo"
      grayColor="slate"
      radius="large"
      style={{
        minHeight: '100dvh',
        background: 'var(--lane-bg)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <Box
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          borderBottom: '1px solid var(--lane-line)',
          background: 'var(--lane-panel)',
        }}
      >
        <Container size="2" px="4">
          <Flex align="center" justify="between" py="3">
            <Flex align="center" gap="2">
              <img
                src="/lane-logo.svg"
                alt="Lane"
                width={26}
                height={26}
                style={{ display: 'block', borderRadius: 6 }}
              />
              <Text weight="bold" size="3">
                lane-mobile
              </Text>
            </Flex>
            <Flex align="center" gap="6">
              <nav>
                <Link
                  to="/phone"
                  search={(prev) => prev}
                  activeOptions={{ exact: true, includeSearch: false }}
                  activeProps={activeProps}
                >
                  手机
                </Link>
                <Link
                  to="/"
                  search={(prev) => prev}
                  activeOptions={{ exact: true, includeSearch: false }}
                  activeProps={activeProps}
                >
                  监控
                </Link>
              </nav>
              <Button
                variant="soft"
                color="gray"
                size="1"
                title="切换主题"
                aria-label={MODE_LABEL[mode]}
                onClick={cycleTheme}
              >
                <ThemeIcon />
              </Button>
            </Flex>
          </Flex>
        </Container>
      </Box>
      <Outlet />
    </Theme>
  )
}
