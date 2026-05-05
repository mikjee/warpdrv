import { Box, Text, HStack, VStack, Flex, Badge, Button, Input, InputGroup, Combobox, createListCollection, Portal, Link as ChakraLink } from '@chakra-ui/react';
import { Play, Plus, Edit, Trash2, ScrollText, Lock, AlertCircle, CheckCircle, XCircle, Search, ChevronDown, ArrowUpAZ, ArrowDownZA } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { useDependantState } from '../../hooks/useDependantState';
import { PageHeader } from '../../components/PageHeader';
import { useMutation } from '../../hooks/useQuery';
import { useStore } from '../../store';
import { deleteRecipe, updateSettings } from '../../api/services';
import { openExternal } from '../../utils/openExternal';
import { ConfirmDialog } from '../../components/dialogs/ConfirmDialog';
import { RecipeEditorDialog } from './RecipeEditorDialog';
import { RunRecipeDialog } from './RunRecipeDialog';
import { ERecipeRunStatus, type IRecipe, type TRecipeSortField } from '@warpcore/shared';

const RECIPE_FIELD_LABELS: Record<TRecipeSortField, string> = {
	name: 'Name',
	createdAt: 'Creation date',
	updatedAt: 'Update date',
};

export function RecipesPage() {
	const recipes = useStore((s) => s.recipes);
	const recipesArr = useMemo(() => Object.values(recipes), [recipes]);
	const activeRun = useStore((s) => s.activeRun);

	const [showAddDialog, setShowAddDialog] = useState(false);
	const [editingRecipe, setEditingRecipe] = useState<IRecipe | null>(null);
	const [runningRecipe, setRunningRecipe] = useState<IRecipe | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const settings = useStore(s => s.settings);
	const [sortField, setSortField] = useDependantState(settings.recipesSortField);
	const [sortOrder, setSortOrder] = useDependantState(settings.recipesSortOrder);

	// Save sort settings when they change
	const handleSortChange = useCallback((field: TRecipeSortField, order: 'asc' | 'desc') => {
		setSortField(field);
		setSortOrder(order);
		updateSettings({ recipesSortField: field, recipesSortOrder: order });
	}, []);

	const sortedRecipes = useMemo(() => {
		const q = searchQuery.toLowerCase().trim();
		let result: Array<IRecipe> = [];
		if (q) {
			result = recipesArr.filter(r =>
				r.name.toLowerCase().includes(q)
				|| r.description.toLowerCase().includes(q)
				|| r.source.toLowerCase().includes(q)
			);
		}
		recipesArr.sort((a, b) => {
			let comparison = 0;
			switch (sortField) {
				case 'name':
					comparison = a.name.localeCompare(b.name);
					break;
				case 'createdAt':
					comparison = a.createdAt - b.createdAt;
					break;
				case 'updatedAt':
					comparison = a.updatedAt - b.updatedAt;
					break;
			}
			return sortOrder === 'asc' ? comparison : -comparison;
		});
		return result;
	}, [recipesArr, searchQuery, sortField, sortOrder]);

	const deleteMut = useMutation<string, null>(useCallback((id: string) => deleteRecipe(id), []));

	const handleDelete = async (id: string) => {
		await deleteMut.mutate(id);
		setDeletingId(null);
	};

	const activeRunRecipe = activeRun !== null ? recipes[activeRun.recipeId] ?? null : null;
	const isAnyRunActive = activeRun !== null && activeRun.status === ERecipeRunStatus.RUNNING;

	return (
		<Box>
			<PageHeader
				title="Recipes"
				subtitle={`${recipes.length} Pipelines`}
				icon={<ScrollText size={20} />}
				actions={
					<HStack gap="3">
						<InputGroup startElement={<Search size={14} color="var(--w-header-search-icon)" />} w="200px">
							<Input
								placeholder="Search recipes..."
								size="sm"
								bg="var(--w-header-search-bg)"
								borderColor="var(--w-header-search-border)"
								color="var(--w-header-search-color)"
								fontSize="13px"
								borderRadius="lg"
								_placeholder={{ color: 'var(--w-header-search-placeholder)' }}
								_focus={{ borderColor: 'var(--w-header-search-focus-border)', outline: 'none' }}
								value={searchQuery}
								onChange={e => setSearchQuery(e.target.value)}
							/>
						</InputGroup>
						<HStack gap="3">
							{(() => {
								const sortCollection = createListCollection({
									items: (Object.keys(RECIPE_FIELD_LABELS) as TRecipeSortField[]).map(f => ({ value: f, label: RECIPE_FIELD_LABELS[f] })),
									itemToString: (item) => item.label ?? '',
								});
								return (
									<Combobox.Root
										collection={sortCollection}
										value={[sortField]}
										onValueChange={(details) => {
											const val = details.value?.[0] as TRecipeSortField;
											if (val) handleSortChange(val, sortOrder);
										}}
									>
										<Combobox.Control>
											<Combobox.Trigger asChild>
												<Button
													variant="outline"
													size="sm"
													w="170px"
													justifyContent="space-between"
													bg="var(--w-header-filter-btn-bg)"
													borderColor="var(--w-header-filter-btn-border)"
													color="var(--w-header-filter-btn-color)"
													fontSize="13px"
													borderRadius="lg"
												>
													{RECIPE_FIELD_LABELS[sortField]}
													<ChevronDown size={14} />
												</Button>
											</Combobox.Trigger>
										</Combobox.Control>
										<Portal>
											<Combobox.Positioner>
												<Combobox.Content
													maxH="200px" overflowY="auto"
													bg="var(--w-header-combobox-bg)" borderWidth="1px" borderColor="var(--w-header-combobox-border)"
													borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
												>
													{sortCollection.items.map((item) => (
														<Combobox.Item
															key={item.value}
															item={item}
															px="3" py="2" borderRadius="md" cursor="pointer"
															_hover={{ bg: 'var(--w-header-combobox-item-hover)' }}
															_highlighted={{ bg: 'var(--w-header-combobox-bg)' }}
														>
															<Text fontSize="12px" color="var(--w-header-combobox-item-text)">{item.label}</Text>
															<Combobox.ItemIndicator />
														</Combobox.Item>
													))}
												</Combobox.Content>
											</Combobox.Positioner>
										</Portal>
									</Combobox.Root>
								);
							})()}
							<Button
								size="sm"
								variant="outline"
								bg="var(--w-header-sortorder-btn-bg)"
								borderColor="var(--w-header-sortorder-btn-border)"
								color="var(--w-header-sortorder-btn-color)"
								borderRadius="md"
								_hover={{ borderColor: 'var(--w-header-sortorder-btn-hover-border)' }}
								title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
								onClick={() => handleSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc')}
							>
								{sortOrder === 'asc' ? <ArrowUpAZ size={14} /> : <ArrowDownZA size={14} />}
							</Button>
						</HStack>
					</HStack>
				}
			/>

			<Box pt="76px" px="4" pb="4">
						<VStack align="stretch" gap="4">
							{/* Active run banner */}
					{isAnyRunActive && activeRunRecipe && (
						<Flex px="4" py="3" borderRadius="xl" borderWidth="1px" borderColor="var(--wc-accent-yellow-border)" bg="var(--wc-accent-yellow-bg-8)" align="center" justify="space-between">
							<HStack gap="3">
								<Box color="var(--wc-accent-yellow)"><Play size={14} /></Box>
								<Text fontSize="13px" color="var(--wc-text-secondary)">Currently running: <Text as="span" fontWeight="600" color="var(--wc-accent-yellow)">{activeRunRecipe.name}</Text></Text>
							</HStack>
							<Button size="xs" bg="var(--wc-accent-yellow-hover-bg)" color="var(--wc-accent-yellow)" _hover={{ bg: 'var(--wc-accent-yellow)' }} onClick={() => setRunningRecipe(activeRunRecipe)}>
								Monitor
							</Button>
						</Flex>
					)}

					{/* Recipes section */}
					<Box borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="xl" bg="var(--wc-bg-subtle)" overflow="hidden">
						<Flex px="4" py="3" align="center" justify="space-between">
							<HStack gap="3">
								<ScrollText size={16} color="var(--wc-text-secondary)" />
								<Text fontSize="13px" fontWeight="600" color="var(--wc-text-heading)">All Recipes</Text>
								<Badge size="sm" px="1.5" borderRadius="full" bg="var(--wc-bg-hover)" color="var(--wc-text-tertiary)" fontSize="10px" fontWeight="600">{recipesArr.length}</Badge>
							</HStack>
							<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ bg: 'var(--wc-accent-blue-bg-8)', color: 'var(--wc-accent-blue-hover)' }} onClick={() => setShowAddDialog(true)}>
								<Plus size={15} />
							</Button>
						</Flex>

						<Box px="4" pb="3">
							{recipesArr.length === 0 ? (
								<Flex h="200px" alignItems="center" justifyContent="center">
									<VStack gap="3" color="var(--wc-text-placeholder)">
										<ScrollText size={40} />
										<Text fontSize="14px">No recipes yet</Text>
										<Text fontSize="12px" color="var(--wc-text-faint)" textAlign="center" mb="4">
											Read the{' '}
											<ChakraLink href="https://github.com/mikjee/warpdrv/blob/master/docs/guides/recipes.md" color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }} onClick={(e) => { e.preventDefault(); openExternal('https://github.com/mikjee/warpdrv/blob/master/docs/guides/recipes.md'); }}>
												guide
											</ChakraLink>{' '}
											on how to use Recipes.
											<br />
											Or add a{' '}
											<ChakraLink href="https://github.com/mikjee/warpdrv/tree/master/docs/recipes" color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }} onClick={(e) => { e.preventDefault(); openExternal('https://github.com/mikjee/warpdrv/tree/master/docs/recipes'); }}>
												sample
											</ChakraLink>{' '}
											recipe from the docs.
										</Text>
										<Button size="xs" bg="var(--wc-accent-blue-bg-12)" color="var(--wc-accent-blue-hover)" _hover={{ bg: 'var(--wc-accent-blue-hover-bg)' }} onClick={() => setShowAddDialog(true)}>
											<Plus size={13} />
											<Text ml="1.5">Create your first recipe</Text>
										</Button>
									</VStack>
								</Flex>
							) : (
								<VStack align="stretch" gap="3">
									{recipesArr.map(recipe => (
										<RecipeRow
											key={recipe.id}
											recipe={recipe}
											onRun={() => setRunningRecipe(recipe)}
											onEdit={() => setEditingRecipe(recipe)}
											onDelete={() => setDeletingId(recipe.id)}
										/>
									))}
								</VStack>
							)}
						</Box>
					</Box>
				</VStack>
			</Box>

			{showAddDialog && <RecipeEditorDialog onClose={() => setShowAddDialog(false)} />}
			{editingRecipe && <RecipeEditorDialog editData={editingRecipe} onClose={() => setEditingRecipe(null)} />}
			{runningRecipe && <RunRecipeDialog recipe={runningRecipe} onClose={() => setRunningRecipe(null)} />}
			{deletingId && (
				<ConfirmDialog
					title="Delete Recipe?"
					message={`This will permanently delete "${recipes[deletingId]?.name}".`}
					isOpen={true}
					isLoading={deleteMut.loading}
					onCancel={() => setDeletingId(null)}
					onConfirm={() => handleDelete(deletingId)}
				/>
			)}
		</Box>
	);
}

interface IRecipeRowProps {
	recipe: IRecipe;
	onRun: () => void;
	onEdit: () => void;
	onDelete: () => void;
}

function RecipeRow({ recipe, onRun, onEdit, onDelete }: IRecipeRowProps) {
	const activeRun = useStore((s) => s.activeRun);
	const isThisActive = activeRun !== null && activeRun.recipeId === recipe.id && activeRun.status === ERecipeRunStatus.RUNNING;
	const isOtherActive = activeRun !== null && activeRun.recipeId !== recipe.id && activeRun.status === ERecipeRunStatus.RUNNING;

	return (
		<Box px="3" py="2" borderRadius="lg" bg="var(--wc-bg-surface)" borderWidth="1px" borderColor={isThisActive ? 'var(--wc-accent-yellow-border)' : 'var(--wc-border-subtle)'} _hover={{ borderColor: isThisActive ? 'var(--wc-accent-yellow-hover)' : 'var(--wc-border-overlay)' }}>
			<Flex justify="space-between" align="center">
				<HStack gap="3" flex="1">
					<Flex w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center" bg="var(--wc-bg-interactive)">
						<ScrollText size={20} color="var(--wc-text-secondary)" />
					</Flex>
					<Box flex="1">
						<HStack gap="2" align="center">
							<Text fontSize="14px" fontWeight="600" color="var(--wc-special-card-name)">{recipe.name}</Text>
							{recipe.isBuiltIn && (
								<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="var(--wc-accent-purple-bg-8)" color="var(--wc-accent-purple)" fontSize="10px" fontWeight="600">
									<HStack gap="1"><Lock size={9} /><Text>Built-in</Text></HStack>
								</Badge>
							)}
							{isThisActive && (
								<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="var(--wc-accent-yellow-hover-bg)" color="var(--wc-accent-yellow)" fontSize="10px" fontWeight="600">Running</Badge>
							)}
						</HStack>
						{recipe.description && (
							<Text fontSize="12px" color="var(--wc-text-muted)" lineClamp={1}>{recipe.description}</Text>
						)}
					</Box>
				</HStack>
				<HStack gap="2">
					<Button size="xs" bg="var(--wc-accent-green-bg-8)" color="var(--wc-accent-green)" _hover={{ bg: 'var(--wc-accent-green-hover-bg)' }} borderRadius="md" onClick={onRun} disabled={isOtherActive}>
						<Play size={13} />
						<Text ml="1">{isThisActive ? 'View' : 'Run'}</Text>
					</Button>
					<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ color: 'var(--wc-accent-blue)', bg: 'var(--wc-accent-blue-bg-8)' }} borderRadius="md" onClick={onEdit} disabled={recipe.isBuiltIn}>
						<Edit size={14} />
					</Button>
					<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }} borderRadius="md" onClick={onDelete} disabled={recipe.isBuiltIn}>
						<Trash2 size={14} />
					</Button>
				</HStack>
			</Flex>
		</Box>
	);
}
