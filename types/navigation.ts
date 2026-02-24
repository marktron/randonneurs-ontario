/** Raw item shape as stored in navigation.json */
export interface NavItemRaw {
  label?: string
  href?: string
  external?: boolean
  style?: 'cta'
  type?: 'heading'
  separator?: boolean
  template?: 'chapters'
  children?: NavItemRaw[]
}

export interface NavigationConfigRaw {
  items: NavItemRaw[]
}

/** Resolved item shape after template expansion — ready for rendering */
export interface NavItem {
  label: string
  href?: string
  external?: boolean
  style?: 'cta'
  type?: 'heading'
  separator?: boolean
  children?: NavItem[]
}

export interface NavigationConfig {
  items: NavItem[]
}
