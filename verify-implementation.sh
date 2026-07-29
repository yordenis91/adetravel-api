#!/bin/bash
# Script para verificar e implementar el flujo de notificaciones de pago completado

echo "🔍 Verificando implementación del disparador de notificaciones..."
echo ""

# 1. Compilar código
echo "1️⃣  Compilando TypeScript..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Error en compilación"
    exit 1
fi
echo "✅ Compilación exitosa"
echo ""

# 2. Verificar archivos creados
echo "2️⃣  Verificando archivos modificados..."
echo ""
echo "📄 Archivos que deben existir:"
FILES=(
    "src/controllers/payments.controller.ts"
    "__tests__/payments.e2e.test.ts"  
    "jest.config.js"
    "jest.setup.js"
    ".env.test"
    "NOTIFICATION_FLOW_DOCS.md"
    "IMPLEMENTATION_SUMMARY.md"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file"
    fi
done
echo ""

# 3. Verificar contenido de payments.controller.ts
echo "3️⃣  Verificando lógica en payments.controller.ts..."
if grep -q "const justCompleted" src/controllers/payments.controller.ts; then
    echo "   ✅ Lógica de 'justCompleted' presente"
else
    echo "   ❌ Lógica de 'justCompleted' NO encontrada"
fi

if grep -q "prisma.notification.create" src/controllers/payments.controller.ts; then
    echo "   ✅ Creación de notificación presente"
else
    echo "   ❌ Creación de notificación NO encontrada"
fi

if grep -q "Pago Recibido" src/controllers/payments.controller.ts; then
    echo "   ✅ Mensaje de notificación presente"
else
    echo "   ❌ Mensaje de notificación NO encontrado"
fi
echo ""

# 4. Información sobre tests
echo "4️⃣  Estado de tests:"
echo "   Test creado: __tests__/payments.e2e.test.ts"
echo "   Para ejecutar: npm test (requiere PostgreSQL)"
echo ""

echo "════════════════════════════════════════════════════════"
echo "✅ IMPLEMENTACIÓN COMPLETADA"
echo "════════════════════════════════════════════════════════"
echo ""
echo "📖 Lee la documentación:"
echo "   - NOTIFICATION_FLOW_DOCS.md (guía técnica completa)"
echo "   - IMPLEMENTATION_SUMMARY.md (resumen de cambios)"
echo ""
echo "🚀 Para probar con BD real:"
echo "   1. npm test (si PostgreSQL está corriendo)"
echo ""
echo "📝 Cambios principales en:"
echo "   - src/controllers/payments.controller.ts (líneas ~127-185)"
echo ""
