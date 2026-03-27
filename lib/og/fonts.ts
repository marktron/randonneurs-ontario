let fontsCache: { sans: ArrayBuffer; serif: ArrayBuffer } | null = null

export async function loadFonts() {
  if (fontsCache) return fontsCache

  const [sans, serif] = await Promise.all([
    fetch(
      'https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99d.ttf'
    ).then((res) => res.arrayBuffer()),
    fetch(
      'https://fonts.gstatic.com/s/notoserif/v33/ga6iaw1J5X9T9RW6j9bNVls-hfgvz8JcMofYTa32J4wsL2JAlAhZT1ejwA.ttf'
    ).then((res) => res.arrayBuffer()),
  ])

  fontsCache = { sans, serif }
  return fontsCache
}
