import React, { useState } from 'react';
import {
  View, Text, Pressable, TextInput, Modal, KeyboardAvoidingView, ScrollView,
  Platform, Alert, ToastAndroid, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, space, radius, type as T, elevate } from '../theme';
import { initials } from '../utils';

export function toast(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert(msg);
}

// Deterministic avatar tint per party, so a shop owner recognises a regular
// customer by colour before reading the name.
const AVATAR_TINTS = ['#2f5d93', '#2e6b57', '#8a4b2a', '#5a4a8f', '#1f6b78', '#8a3f5b', '#4a6230'];
function tintFor(name) {
  const s = String(name || '?');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function Header({ title, subtitle, left, right, onTitlePress }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const Title = onTitlePress ? Pressable : View;
  return (
    <View style={[{ backgroundColor: c.brand, paddingTop: insets.top + space.md, paddingBottom: space.md, paddingHorizontal: space.md }, elevate(c, 2)]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {left}
        <Title
          onPress={onTitlePress}
          android_ripple={onTitlePress ? { color: 'rgba(255,255,255,.14)' } : undefined}
          style={{ flex: 1, minWidth: 0, paddingLeft: left ? 0 : space.xs, paddingVertical: 2 }}>
          <Text numberOfLines={1} style={{ ...T.title, color: c.brandInk }}>{title}</Text>
          {subtitle ? (
            <Text numberOfLines={1} style={{ ...T.caption, color: c.brandInk, opacity: 0.72, marginTop: 1 }}>{subtitle}</Text>
          ) : null}
        </Title>
        {right}
      </View>
    </View>
  );
}

export function IconBtn({ label, onPress, a11y, tone = 'brand' }) {
  const c = useTheme();
  const fg = tone === 'brand' ? c.brandInk : c.text;
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6}
      android_ripple={{ color: tone === 'brand' ? 'rgba(255,255,255,.22)' : c.line, borderless: true }}
      style={({ pressed }) => ({
        width: 38, height: 38, borderRadius: radius.pill,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? (tone === 'brand' ? 'rgba(255,255,255,.14)' : c.lineSoft) : 'transparent',
      })}>
      <Text style={{ color: fg, fontSize: 18 }}>{label}</Text>
    </Pressable>
  );
}

export function Avatar({ name, size = 44, onBrand }) {
  const c = useTheme();
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.32,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: onBrand ? 'rgba(255,255,255,.18)' : tintFor(name),
    }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36, letterSpacing: 0.2 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

// A plain raised container. Screens compose these instead of repeating
// borderWidth / borderColor / borderRadius everywhere.
export function Card({ children, style, padded = true, level = 1 }) {
  const c = useTheme();
  return (
    <View style={[{
      backgroundColor: c.surface, borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.lineSoft,
      padding: padded ? space.lg : 0,
    }, elevate(c, level), style]}>
      {children}
    </View>
  );
}

export function Btn({ label, onPress, kind = 'primary', style, disabled, busy, icon, size = 'md' }) {
  const c = useTheme();
  const map = {
    primary: { bg: c.brand, fg: c.brandInk, border: c.brand },
    ghost: { bg: c.surface, fg: c.text, border: c.line },
    quiet: { bg: 'transparent', fg: c.brand, border: 'transparent' },
    danger: { bg: c.surface, fg: c.red, border: c.line },
    red: { bg: c.red, fg: '#ffffff', border: c.red },
    green: { bg: c.green, fg: '#ffffff', border: c.green },
  }[kind];
  const pad = size === 'sm' ? 9 : 13;
  const off = disabled || busy;
  return (
    <Pressable
      onPress={off ? undefined : onPress} accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      android_ripple={off ? undefined : { color: 'rgba(0,0,0,.08)' }}
      style={({ pressed }) => [{
        backgroundColor: map.bg, borderColor: map.border, borderWidth: 1,
        borderRadius: radius.md, paddingVertical: pad, paddingHorizontal: space.lg,
        alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm,
        opacity: off ? 0.45 : pressed ? 0.86 : 1,
      }, style]}>
      {busy ? <ActivityIndicator size="small" color={map.fg} /> : icon ? <Text style={{ fontSize: 15 }}>{icon}</Text> : null}
      <Text style={{ color: map.fg, fontWeight: '700', fontSize: size === 'sm' ? 13.5 : 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, onPress, selected }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({
        paddingVertical: 8, paddingHorizontal: space.lg, borderRadius: radius.pill,
        backgroundColor: selected ? c.brand : c.surface,
        borderWidth: 1, borderColor: selected ? c.brand : c.line,
        opacity: pressed ? 0.75 : 1,
      })}>
      <Text style={{ ...T.label, color: selected ? c.brandInk : c.text }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, error, style, ...props }) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? c.red : focused ? c.brand : c.line;
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? <Text style={{ ...T.label, color: c.muted, marginBottom: space.xs + 1 }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.faint}
        onFocus={(e) => { setFocused(true); if (props.onFocus) props.onFocus(e); }}
        onBlur={(e) => { setFocused(false); if (props.onBlur) props.onBlur(e); }}
        {...props}
        style={[{
          borderWidth: focused || error ? 1.6 : 1, borderColor: border,
          backgroundColor: c.surfaceAlt, color: c.text,
          borderRadius: radius.md, paddingHorizontal: space.md + 1,
          paddingVertical: 11, fontSize: 16,
        }, style]}
      />
      {hint && !error ? <Text style={{ ...T.caption, color: c.faint, marginTop: space.xs }}>{hint}</Text> : null}
    </View>
  );
}

// Sliding selector with equal-width options.
export function Seg({ options, value, onChange, style }) {
  const c = useTheme();
  return (
    <View style={[{
      flexDirection: 'row', backgroundColor: c.lineSoft, borderRadius: radius.md,
      padding: 3, marginBottom: space.md,
    }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value} onPress={() => onChange(o.value)}
            accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[{
              flex: 1, paddingVertical: 9, borderRadius: radius.sm + 1, alignItems: 'center',
              backgroundColor: on ? c.surface : 'transparent',
            }, on ? elevate(c, 1) : null]}>
            <Text style={{ fontWeight: on ? '700' : '600', fontSize: 14, color: on ? c.text : c.muted }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionLabel({ children, style }) {
  const c = useTheme();
  return (
    <Text style={[{ ...T.label, color: c.muted, marginBottom: space.sm, marginLeft: 2 }, style]}>
      {children}
    </Text>
  );
}

export function ErrorText({ children }) {
  const c = useTheme();
  if (!children) return <View style={{ minHeight: space.sm }} />;
  return (
    <View style={{
      flexDirection: 'row', gap: space.sm, alignItems: 'flex-start',
      backgroundColor: c.redBg, borderRadius: radius.sm,
      paddingVertical: space.sm, paddingHorizontal: space.md, marginBottom: space.sm,
    }}>
      <Text style={{ color: c.red, fontSize: 13 }}>{'\u26A0'}</Text>
      <Text style={{ color: c.red, fontWeight: '600', fontSize: 13, flex: 1 }}>{children}</Text>
    </View>
  );
}

export function Note({ children }) {
  const c = useTheme();
  return (
    <View style={{
      backgroundColor: c.brandSoft, borderRadius: radius.md,
      paddingVertical: space.md, paddingHorizontal: space.md, marginBottom: space.md,
    }}>
      <Text style={{ ...T.caption, color: c.text, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

export function Empty({ title, body, action }) {
  const c = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl + space.sm, paddingHorizontal: space.xl }}>
      <Text style={{ ...T.title, color: c.text, marginBottom: space.xs, textAlign: 'center' }}>{title}</Text>
      <Text style={{ ...T.body, color: c.muted, textAlign: 'center', lineHeight: 21 }}>{body}</Text>
      {action ? <View style={{ marginTop: space.lg }}>{action}</View> : null}
    </View>
  );
}

export function Sheet({ title, subtitle, onClose, children }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* Android resizes the window for the keyboard itself; forcing
          behavior="padding" there double-counts and crops the sheet. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' }} onPress={onClose}>
          <Pressable
            onPress={() => {}}
            style={[{
              backgroundColor: c.surface,
              borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
              paddingHorizontal: space.lg + 2, paddingTop: space.sm,
              paddingBottom: space.lg + insets.bottom, maxHeight: '92%',
            }, elevate(c, 3)]}>
            <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: c.line, marginBottom: space.md }} />
            <Text style={{ ...T.title, color: c.text }}>{title}</Text>
            {subtitle ? (
              <Text style={{ ...T.caption, color: c.muted, marginTop: 3, lineHeight: 17 }}>{subtitle}</Text>
            ) : null}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ marginTop: space.lg }}
              contentContainerStyle={{ paddingBottom: space.xs }}>
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function BottomNav({ view, onNav, onSettings }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const Item = ({ icon, label, on, onPress }) => (
    <Pressable
      onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      android_ripple={{ color: c.lineSoft }}
      style={{ flex: 1, alignItems: 'center', paddingTop: space.sm, paddingBottom: space.sm }}>
      <View style={{
        paddingHorizontal: space.lg, paddingVertical: 3, borderRadius: radius.pill,
        backgroundColor: on ? c.brandSoft : 'transparent', marginBottom: 2,
      }}>
        <Text style={{ fontSize: 18, opacity: on ? 1 : 0.6 }}>{icon}</Text>
      </View>
      <Text style={{ fontSize: 11.5, fontWeight: on ? '700' : '600', color: on ? c.brand : c.muted }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[{
      flexDirection: 'row', backgroundColor: c.surface,
      borderTopWidth: 1, borderTopColor: c.lineSoft, paddingBottom: insets.bottom,
    }, elevate(c, 2)]}>
      <Item icon={'\uD83D\uDC65'} label="Parties" on={view === 'home'} onPress={() => onNav('home')} />
      <Item icon={'\uD83D\uDCD2'} label="Cashbook" on={view === 'cash'} onPress={() => onNav('cash')} />
      <Item icon={'\u2699\uFE0F'} label="Settings" on={false} onPress={onSettings} />
    </View>
  );
}
