import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
  Platform,
  KeyboardAvoidingView,
} from "react-native";

// ScreenLayout
// - Standardizes background + horizontal padding + bottom spacing
// - Lets screens choose between ScrollView and FlatList
// - Supports an optional header slot (typically <ScreenHeader />)
// - Keeps keyboard-friendly behavior for forms

type CommonProps = {
  header?: React.ReactNode;

  // Optional content rendered below the header (e.g., filters, summary pills)
  top?: React.ReactNode;

  children?: React.ReactNode;

  // Background color of the page
  backgroundColor?: string;

  // If true, applies KeyboardAvoidingView for forms
  keyboardAvoiding?: boolean;

  // Additional padding at the bottom of the content (useful for tab bar)
  bottomPadding?: number;

  // Horizontal padding for screen content
  contentPaddingHorizontal?: number;

  // If you want to keep header aligned with content padding.
  // When false, header is full-bleed.
  headerAligned?: boolean;

  // Optional wrapper styles
  style?: any;
  contentContainerStyle?: any;
};

type ScrollProps = CommonProps & {
  variant?: "scroll";
  showsVerticalScrollIndicator?: boolean;
};

type ListProps<ItemT> = CommonProps & {
  variant: "list";
  data: ItemT[];
  keyExtractor: (item: ItemT, index: number) => string;
  renderItem: ({
    item,
    index,
  }: {
    item: ItemT;
    index: number;
  }) => React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
  showsVerticalScrollIndicator?: boolean;
};

export type ScreenLayoutProps<ItemT = any> = ScrollProps | ListProps<ItemT>;

const DEFAULT_BG = "#f7f7f7";
const DEFAULT_PAD_X = 20;
const DEFAULT_BOTTOM_PAD = 24;

export default function ScreenLayout<ItemT = any>(
  props: ScreenLayoutProps<ItemT>
) {
  const {
    header,
    top,
    children,
    backgroundColor = DEFAULT_BG,
    keyboardAvoiding,
    bottomPadding = DEFAULT_BOTTOM_PAD,
    contentPaddingHorizontal = DEFAULT_PAD_X,
    headerAligned = true,
    style,
    contentContainerStyle,
  } = props as any;

  // For both ScrollView and FlatList: header without padding (padding applied via contentContainerStyle or listHeader)
  const headerNodeNoPadding = header ? (
    <View style={styles.headerWrap}>{header}</View>
  ) : null;

  // For FlatList, ListHeaderComponent doesn't receive contentContainerStyle padding.
  // So we need to handle padding differently: remove padding from contentContainerStyle
  // and apply it in listHeader and wrap each renderItem result.
  const listContentStyle = [
    styles.content,
    {
      paddingBottom: bottomPadding,
      // paddingHorizontal removed - will be applied per-item via wrapper
    },
    contentContainerStyle,
  ];

  const scrollContentStyle = [
    styles.content,
    {
      paddingHorizontal: contentPaddingHorizontal,
      paddingBottom: bottomPadding,
    },
    contentContainerStyle,
  ];

  // For FlatList, apply padding to listHeader since ListHeaderComponent doesn't receive contentContainerStyle padding
  const listHeaderContent =
    header || top ? (
      headerAligned ? (
        <View
          style={[
            styles.listHeader,
            { paddingHorizontal: contentPaddingHorizontal },
          ]}
        >
          {headerNodeNoPadding}
          {top}
        </View>
      ) : (
        <View style={styles.listHeader}>
          {headerNodeNoPadding}
          {top ? (
            <View style={{ paddingHorizontal: contentPaddingHorizontal }}>
              {top}
            </View>
          ) : null}
        </View>
      )
    ) : null;

  // Wrap renderItem to apply padding to each item
  const wrappedRenderItem =
    props.variant === "list"
      ? ({ item, index }: { item: any; index: number }) => {
          const result = props.renderItem({ item, index });
          return (
            <View style={{ paddingHorizontal: contentPaddingHorizontal }}>
              {result}
            </View>
          );
        }
      : undefined;

  const body =
    props.variant === "list" ? (
      <FlatList
        style={[styles.flex, { backgroundColor }, style]}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={
          props.showsVerticalScrollIndicator ?? false
        }
        data={props.data}
        keyExtractor={props.keyExtractor}
        renderItem={wrappedRenderItem!}
        ListEmptyComponent={props.ListEmptyComponent}
        ListHeaderComponent={listHeaderContent}
      />
    ) : (
      <ScrollView
        style={[styles.flex, { backgroundColor }, style]}
        contentContainerStyle={scrollContentStyle}
        showsVerticalScrollIndicator={
          props.showsVerticalScrollIndicator ?? false
        }
        keyboardShouldPersistTaps="handled"
      >
        {headerNodeNoPadding}
        {top ? (
          <View style={{ paddingHorizontal: contentPaddingHorizontal }}>
            {top}
          </View>
        ) : null}
        {children}
      </ScrollView>
    );

  if (!keyboardAvoiding) return body;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingTop: 0,
  },
  headerWrap: {
    paddingHorizontal: 0, // paddingHorizontal is applied in headerNode wrapper
    paddingTop: 0,
    paddingBottom: 0,
  },
  listHeader: {
    // Keeps header separated from list body while still using content padding
    marginBottom: 0,
    width: "100%", // ListHeaderComponent가 전체 너비를 차지하도록
  },
});
