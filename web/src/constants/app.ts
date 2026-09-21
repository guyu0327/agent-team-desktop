import { CHANGELOG } from '@/views/profile/changelog'

export const APP_NAME = '智群 AgentTeam'

/** 版本号即最新发布日期（yyyy.MM.DD），直接取更新日志最新条目，不会漏同步 */
export const APP_VERSION = CHANGELOG[0].date.replaceAll('-', '.')

export const GITHUB_REPO_URL = 'https://github.com/guyu0327/agent-team-desktop'

export const CSDN_BLOG_URL = 'https://blog.csdn.net/NuclearDalance/article/details/165124537'
