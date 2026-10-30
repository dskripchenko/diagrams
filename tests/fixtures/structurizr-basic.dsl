workspace {
  model {
    user = person "Customer" "Buys things"
    shop = softwareSystem "Shop" {
      web = container "Web app" "Storefront" "React"
      api = container "API" "Orders" "Kotlin"
      db = container "Orders" "" "PostgreSQL" "Database"
    }
    psp = softwareSystem "Payments" "Card payments" "External"
    user -> web "Uses" "HTTPS"
    web -> api "Calls" "JSON"
    api -> db "Reads and writes"
    api -> psp "Charges"
  }
  views {
    container shop {
      include *
      autolayout lr
    }
    theme default
  }
}
